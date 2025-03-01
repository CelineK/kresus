import { assert, translate as $t } from '../helpers';
import { hasForbiddenOrMissingField, hasForbiddenField } from '../../shared/validators';
import { DEFAULT_ACCOUNT_ID } from '../../shared/settings';
import DefaultSettings from '../../shared/default-settings';
import {
    Account,
    Access,
    AccessCustomField,
    Alert,
    Budget,
    Category,
    PartialTransaction,
} from '../models';
import { FinishUserActionFields } from './banks';

class Request {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | null = null;
    contentType: string | null = null;
    bodyContent: string | null = null;
    extraOptions: Record<string, string> | null = null;

    constructor(url: string) {
        this.url = url;
    }
    put() {
        assert(this.method === null, 'method redefined');
        this.method = 'PUT';
        return this;
    }
    delete() {
        assert(this.method === null, 'method redefined');
        this.method = 'DELETE';
        return this;
    }
    post() {
        assert(this.method === null, 'method redefined');
        this.method = 'POST';
        return this;
    }
    json(record: Record<string, any>) {
        assert(this.contentType === null, 'content type redefined');
        assert(this.bodyContent === null, 'body redefined');
        this.contentType = 'application/json';
        this.bodyContent = JSON.stringify(record);
        return this;
    }
    text(textContent: string) {
        assert(this.contentType === null, 'content type redefined');
        assert(this.bodyContent === null, 'body redefined');
        this.contentType = 'text/plain';
        this.bodyContent = textContent;
        return this;
    }
    options(extraOptions: Record<string, string>) {
        assert(this.extraOptions === null, 'options redefined');
        this.extraOptions = extraOptions;
        return this;
    }

    async run() {
        const options: any = {
            // Send credentials in case the API is behind an HTTP auth.
            credentials: 'include',
            ...this.extraOptions,
        };

        if (this.method !== null) {
            options.method = this.method;
        }
        if (this.contentType !== null) {
            options.headers = {
                'Content-Type': this.contentType,
            };
        }
        if (this.bodyContent) {
            options.body = this.bodyContent;
        }

        let response;
        try {
            response = await window.fetch(this.url, options);
        } catch (e) {
            let message = e.message || '?';
            let shortMessage = message;
            if (message && message.includes('NetworkError')) {
                message = shortMessage = $t('client.general.network_error');
            }
            throw {
                code: null,
                message,
                shortMessage,
            };
        }

        const contentType = response.headers.get('Content-Type');
        const isJsonResponse = contentType !== null && contentType.includes('json');

        // Do the JSON parsing ourselves. Otherwise, we cannot access the raw
        // text in case of a JSON decode error nor can we only decode if the
        // body is not empty.
        const body = await response.text();

        let bodyOrJson;
        if (!isJsonResponse) {
            bodyOrJson = body;
        } else if (!body) {
            bodyOrJson = {};
        } else {
            try {
                bodyOrJson = JSON.parse(body);
            } catch (e) {
                throw {
                    code: null,
                    message: e.message || '?',
                    shortMessage: $t('client.general.json_parse_error'),
                };
            }
        }

        // If the initial response status code wasn't in the 200 family, the
        // JSON describes an error.
        if (!response.ok) {
            throw {
                code: bodyOrJson.code,
                message: bodyOrJson.message || '?',
                shortMessage: bodyOrJson.shortMessage || bodyOrJson.message || '?',
            };
        }

        return bodyOrJson;
    }
}

// /api/all
export function init() {
    return new Request('api/all/').options({ cache: 'no-cache' }).run();
}
export function importInstance(data: any, maybePassword?: string) {
    return new Request('api/all')
        .post()
        .json({
            data,
            encrypted: !!maybePassword,
            passphrase: maybePassword,
        })
        .run();
}
export function importOFX(data: string, _maybePassword?: string) {
    return new Request('api/all/import/ofx').post().text(data).run();
}
export function exportInstance(maybePassword?: string) {
    return new Request('api/all/export')
        .post()
        .json({
            encrypted: !!maybePassword,
            passphrase: maybePassword,
        })
        .run();
}

// /api/accesses
export function createAccess(
    vendorId: string,
    login: string,
    password: string,
    customFields: AccessCustomField[],
    customLabel: string | null,
    userActionFields: FinishUserActionFields | null = null
) {
    const data = {
        vendorId,
        login,
        password,
        customLabel,
        fields: customFields,
        // TODO would be nice to separate the access' fields from the user action fields.
        userActionFields,
    };
    return new Request('api/accesses').post().json(data).run();
}

export function updateAccess(accessId: number, update: Partial<Access>) {
    const error = hasForbiddenField(update, ['enabled', 'customLabel']);
    if (error) {
        return Promise.reject(`Developer error when updating an access: ${error}`);
    }
    return new Request(`api/accesses/${accessId}`).put().json(update).run();
}

export function updateAndFetchAccess(
    accessId: number,
    access: {
        login: string;
        password: string;
        customFields: AccessCustomField[];
    },
    userActionFields: FinishUserActionFields | null = null
) {
    const error = hasForbiddenField(access, ['login', 'password', 'customFields']);
    if (error) {
        return Promise.reject(`Developer error when updating an access: ${error}`);
    }
    // Transform the customFields update to the server's format.
    const { customFields, ...rest } = access;
    const data = { fields: customFields, ...rest, userActionFields };
    return new Request(`api/accesses/${accessId}/fetch/accounts`).put().json(data).run();
}

export function getNewAccounts(
    accessId: number,
    userActionFields: FinishUserActionFields | null = null
) {
    let request = new Request(`api/accesses/${accessId}/fetch/accounts`).post();
    if (userActionFields !== null) {
        request = request.json({
            userActionFields,
        });
    }
    return request.run();
}
export function getNewOperations(
    accessId: number,
    userActionFields: FinishUserActionFields | null = null
) {
    let request = new Request(`api/accesses/${accessId}/fetch/operations`).post();
    if (userActionFields !== null) {
        request = request.json({
            userActionFields,
        });
    }
    return request.run();
}
export function deleteAccess(accessId: number) {
    return new Request(`api/accesses/${accessId}`).delete().run();
}

export function deleteAccessSession(accessId: number) {
    return new Request(`api/accesses/${accessId}/session`).delete().run();
}

// /api/accounts
export function updateAccount(accountId: number, newFields: Partial<Account>) {
    const error = hasForbiddenField(newFields, ['excludeFromBalance', 'customLabel']);
    if (error) {
        return Promise.reject(`Developer error when updating an account: ${error}`);
    }
    return new Request(`api/accounts/${accountId}`).put().json(newFields).run();
}
export function deleteAccount(accountId: number) {
    return new Request(`api/accounts/${accountId}`).delete().run();
}
export async function resyncBalance(
    accountId: number,
    userActionFields: FinishUserActionFields | null = null
) {
    let request = new Request(`api/accounts/${accountId}/resync-balance`).post();
    if (userActionFields !== null) {
        request = request.json({ userActionFields });
    }
    return request.run();
}

// /api/operations
export function createOperation(operation: PartialTransaction) {
    return new Request('api/operations').post().json(operation).run();
}
export function updateOperation(id: number, newOp: PartialTransaction) {
    return new Request(`api/operations/${id}`).put().json(newOp).run();
}
export function setCategoryForOperation(operationId: number, categoryId: number | null) {
    return updateOperation(operationId, { categoryId });
}
export function setTypeForOperation(operationId: number, type: string) {
    return updateOperation(operationId, { type });
}
export function setCustomLabel(operationId: number, customLabel: string) {
    return updateOperation(operationId, { customLabel });
}
export function setOperationBudgetDate(operationId: number, budgetDate: Date | null) {
    return updateOperation(operationId, { budgetDate });
}
export function deleteOperation(opId: number) {
    return new Request(`api/operations/${opId}`).delete().run();
}
export function mergeOperations(toKeepId: number, toRemoveId: number) {
    return new Request(`api/operations/${toKeepId}/mergeWith/${toRemoveId}`).put().run();
}

// /api/categories
export function addCategory(category: Partial<Category>) {
    const error = hasForbiddenOrMissingField(category, ['label', 'color']);
    if (error) {
        return Promise.reject(`Developer error when adding a category: ${error}`);
    }
    return new Request('api/categories').post().json(category).run();
}
export function updateCategory(id: number, category: Partial<Category>) {
    const error = hasForbiddenField(category, ['label', 'color']);
    if (error) {
        return Promise.reject(`Developer error when updating a category: ${error}`);
    }
    return new Request(`api/categories/${id}`).put().json(category).run();
}
export function deleteCategory(categoryId: number, replaceByCategoryId: number | null) {
    return new Request(`api/categories/${categoryId}`).delete().json({ replaceByCategoryId }).run();
}

// /api/budgets
export function fetchBudgets(year: number, month: number) {
    return new Request(`api/budgets/${year}/${month}`).run();
}
export function updateBudget(budget: Partial<Budget>) {
    const { categoryId, year, month } = budget;
    return new Request(`api/budgets/${categoryId}/${year}/${month}`).put().json(budget).run();
}

// /api/alerts
export function createAlert(newAlert: Partial<Alert>) {
    return new Request('api/alerts').post().json(newAlert).run();
}
export function updateAlert(alertId: number, attributes: Partial<Alert>) {
    return new Request(`api/alerts/${alertId}`).put().json(attributes).run();
}
export function deleteAlert(alertId: number) {
    return new Request(`api/alerts/${alertId}`).delete().run();
}

// /api/settings
export function saveSetting(key: string, value: string | null) {
    let normalizedValue;

    switch (key) {
        case DEFAULT_ACCOUNT_ID:
            normalizedValue = value === null ? DefaultSettings.get(DEFAULT_ACCOUNT_ID) : value;
            break;

        default:
            normalizedValue = value;
            break;
    }

    return new Request('api/settings').post().json({ key, value: normalizedValue }).run();
}

// /api/instance
export function sendTestEmail(email: string) {
    return new Request('api/instance/test-email').post().json({ email }).run();
}
export function sendTestNotification(appriseUrl: string) {
    return new Request('api/instance/test-notification').post().json({ appriseUrl }).run();
}
export function updateWeboob() {
    return new Request('api/instance/weboob/').put().run();
}
export function fetchWeboobVersion() {
    return new Request('api/instance/weboob').run();
}

// /api/logs & /api/demo
export function fetchLogs() {
    return new Request('api/logs').run();
}
export function clearLogs() {
    return new Request('api/logs').delete().run();
}
export function enableDemoMode() {
    return new Request('api/demo').post().run();
}
export function disableDemoMode() {
    return new Request('api/demo').delete().run();
}
