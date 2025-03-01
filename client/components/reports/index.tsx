import React, { useCallback, useContext, useEffect, useState } from 'react';

import { useDispatch } from 'react-redux';

import {
    translate as $t,
    localeComparator,
    formatDate,
    useKresusState,
    assert,
} from '../../helpers';

import { get, actions, GlobalState } from '../../store';

import InfiniteList from '../ui/infinite-list';
import TransactionUrls from '../transactions/urls';

import SearchComponent from './search';
import BulkEditComponent from './bulkedit';
import { OperationItem, PressableOperationItem } from './item';
import MonthYearSeparator from './month-year-separator';
import SyncButton from './sync-button';
import DisplayIf, { IfNotMobile } from '../ui/display-if';
import { ViewContext } from '../drivers';

import './reports.css';
import './account-summary.css';
import './toolbar.css';

import { Operation } from '../../models';
import { ButtonLink } from '../ui';

// Keep in sync with reports.css.
function getTransactionHeight(isSmallScreen: boolean) {
    return isSmallScreen ? 41 : 55;
}

// Infinite list properties.
const NUM_ITEM_BALLAST = 10;
const CONTAINER_ID = 'content-container';

const ITEM_KIND_TRANSACTION = 0;
const ITEM_KIND_DATE_SEPARATOR = 1;

const SearchButton = () => {
    const dispatch = useDispatch();

    const handleClick = useCallback(() => {
        actions.toggleSearchDetails(dispatch);
    }, [dispatch]);

    return (
        <button
            type="button"
            className="btn"
            aria-label={$t('client.search.title')}
            onClick={handleClick}
            title={$t('client.search.title')}>
            <span className="fa fa-search" />
            <span className="label">{$t('client.search.title')}</span>
        </button>
    );
};

const BulkEditButton = (props: { handleClick: () => void; isActive: boolean }) => {
    let toggleButtonClass = 'btn';
    if (props.isActive) {
        toggleButtonClass += ' active';
    }
    return (
        <button
            type="button"
            className={toggleButtonClass}
            aria-label={$t('client.bulkedit.title')}
            onClick={props.handleClick}
            title={$t('client.bulkedit.title')}>
            <span className="label">{$t('client.bulkedit.title')}</span>
            <span className="fa fa-list-alt" />
        </button>
    );
};

const Reports = () => {
    const view = useContext(ViewContext);

    const transactionIds = view.transactionIds;
    const hasSearchFields = useKresusState(state => get.hasSearchFields(state));
    const filteredOperationIds = useKresusState(state => {
        if (!get.hasSearchFields(state)) {
            return transactionIds;
        }

        const search = get.searchFields(state);
        const filtered = [];
        for (const t of transactionIds.map(id => get.operationById(state, id))) {
            if (search.categoryIds.length > 0 && !search.categoryIds.includes(t.categoryId)) {
                continue;
            }
            if (search.type !== '' && t.type !== search.type) {
                continue;
            }
            if (search.amountLow !== null && t.amount < search.amountLow) {
                continue;
            }
            if (search.amountHigh !== null && t.amount > search.amountHigh) {
                continue;
            }
            if (search.dateLow !== null && t.date < search.dateLow) {
                continue;
            }
            if (search.dateHigh !== null && t.date > search.dateHigh) {
                continue;
            }
            if (search.keywords.length > 0) {
                let foundAll = true;
                for (const str of search.keywords) {
                    if (
                        (t.customLabel === null || !localeContains(t.customLabel, str)) &&
                        !localeContains(t.label, str) &&
                        !localeContains(t.rawLabel, str)
                    ) {
                        foundAll = false;
                        break;
                    }
                }
                if (!foundAll) {
                    continue;
                }
            }
            filtered.push(t.id);
        }
        return filtered;
    });

    const wellOperationIds = useKresusState(state => {
        if (hasSearchFields) {
            return filteredOperationIds;
        }
        return filterOperationsThisMonth(state, transactionIds);
    });

    const positiveSumNum = useKresusState(state =>
        computeTotal(state, x => x.amount > 0, wellOperationIds)
    );
    const negativeSumNum = useKresusState(state =>
        computeTotal(state, x => x.amount < 0, wellOperationIds)
    );
    const wellSumNum = positiveSumNum + negativeSumNum;

    const positiveSum = view.formatCurrency(positiveSumNum);
    const negativeSum = view.formatCurrency(negativeSumNum);
    const wellSum = view.formatCurrency(wellSumNum);

    // Insert month/year rows. We expect transactions ids to already be sorted chronologically.
    const filteredTransactionsItems = useKresusState(state => {
        const ret: {
            kind: typeof ITEM_KIND_DATE_SEPARATOR | typeof ITEM_KIND_TRANSACTION;
            transactionId?: number;
            month?: number;
            year?: number;
        }[] = [];

        let month = null;
        let year = null;
        for (const opId of filteredOperationIds) {
            const transaction = get.operationById(state, opId);
            const transactionMonth = transaction.date.getMonth();
            const transactionYear = transaction.date.getFullYear();

            if (
                month === null ||
                year === null ||
                transactionYear !== year ||
                transactionMonth !== month
            ) {
                ret.push({
                    kind: ITEM_KIND_DATE_SEPARATOR,
                    month: transactionMonth,
                    year: transactionYear,
                });
                month = transactionMonth;
                year = transactionYear;
            }

            ret.push({
                kind: ITEM_KIND_TRANSACTION,
                transactionId: opId,
            });
        }

        return ret;
    });

    const [minAmount, maxAmount] = useKresusState(state => computeMinMax(state, transactionIds));

    const isSmallScreen = useKresusState(state => get.isSmallScreen(state));
    const transactionHeight = getTransactionHeight(isSmallScreen);

    const refOperationTable = React.createRef<HTMLTableElement>();
    const refThead = React.createRef<HTMLTableSectionElement>();

    const [heightAbove, setHeightAbove] = useState(0);
    const [inBulkEditMode, setInBulkEditMode] = useState(false);
    const [bulkEditSelectAll, setBulkEditSelectAll] = useState(false);
    const [bulkEditSelectedSet, setBulkEditSelectedSet] = useState<Set<number>>(new Set());

    const defineBulkSet = useCallback(
        (selectAll: boolean, selectedSet: Set<number>) => {
            const transactionsIds = filteredTransactionsItems
                .filter(item => item.kind === ITEM_KIND_TRANSACTION)
                .map(item => (item as { transactionId: number }).transactionId);

            let changedSet = false;

            // Removes from bulkEditSelectedSet all the transactions which aren't in the
            // filteredTransactionsItems array anymore (because we changed account, or
            // searched something, etc.).
            const newItemSet = new Set(transactionsIds);
            for (const id of selectedSet.values()) {
                if (!newItemSet.has(id)) {
                    selectedSet.delete(id);
                    changedSet = true;
                }
            }

            if (selectAll) {
                for (const id of transactionsIds) {
                    if (!selectedSet.has(id)) {
                        selectedSet.add(id);
                        changedSet = true;
                    }
                }
            }

            setBulkEditSelectAll(selectAll);
            setBulkEditSelectedSet(changedSet ? new Set(selectedSet) : selectedSet);
        },
        [filteredTransactionsItems, setBulkEditSelectAll, setBulkEditSelectedSet]
    );

    useEffect(() => {
        if (inBulkEditMode) {
            defineBulkSet(bulkEditSelectAll, bulkEditSelectedSet);
        }
    }, [
        filteredTransactionsItems,
        inBulkEditMode,
        bulkEditSelectAll,
        bulkEditSelectedSet,
        defineBulkSet,
    ]);

    const toggleBulkEditMode = useCallback(() => {
        setInBulkEditMode(!inBulkEditMode);
        defineBulkSet(false, new Set());
        // renderInfiniteList();
    }, [defineBulkSet, setInBulkEditMode, inBulkEditMode]);

    const toggleAllBulkItems = useCallback(
        isChecked => {
            let selected: Set<number>;
            if (!isChecked) {
                selected = new Set();
            } else {
                const transactionsIds = filteredTransactionsItems
                    .filter(item => item.kind === ITEM_KIND_TRANSACTION)
                    .map(item => (item as { transactionId: number }).transactionId);
                selected = new Set(transactionsIds);
            }
            defineBulkSet(isChecked, selected);
            // renderInfiniteList();
        },
        [filteredTransactionsItems, defineBulkSet]
    );

    const toggleBulkItem = useCallback(
        itemId => {
            // Deep copy the state, to force a re-render of the apply button.
            const selectedSet = new Set(bulkEditSelectedSet);

            if (selectedSet.has(itemId)) {
                selectedSet.delete(itemId);
            } else {
                selectedSet.add(itemId);
            }

            // Update the "select all" checkbox when transactions are manually selected.
            const selectedAll =
                selectedSet.size ===
                filteredTransactionsItems.reduce(
                    (count, item) => count + (item.kind === ITEM_KIND_TRANSACTION ? 1 : 0),
                    0
                );

            defineBulkSet(selectedAll, selectedSet);
            // renderInfiniteList();
        },
        [filteredTransactionsItems, bulkEditSelectedSet, defineBulkSet]
    );

    const renderItems = useCallback(
        (items, low, high) => {
            const Item = isSmallScreen ? PressableOperationItem : OperationItem;

            const max = Math.min(items.length, high);

            const renderedItems = [];
            for (let i = low; i < max; ++i) {
                const item = items[i];

                // Check whether this is a transaction id or a month/year separator.
                if (item.kind === ITEM_KIND_DATE_SEPARATOR) {
                    renderedItems.push(
                        <MonthYearSeparator
                            key={`${item.month}${item.year}`}
                            month={item.month}
                            year={item.year}
                            colspan={isSmallScreen ? 3 : 6}
                        />
                    );
                } else {
                    renderedItems.push(
                        <Item
                            key={item.transactionId}
                            operationId={item.transactionId}
                            formatCurrency={view.formatCurrency}
                            isMobile={isSmallScreen}
                            inBulkEditMode={inBulkEditMode}
                            bulkEditStatus={bulkEditSelectedSet.has(item.transactionId)}
                            toggleBulkItem={toggleBulkItem}
                        />
                    );
                }
            }

            return renderedItems;
        },
        [bulkEditSelectedSet, toggleBulkItem, view.formatCurrency, inBulkEditMode, isSmallScreen]
    );

    useEffect(() => {
        // On every re-render.
        let newHeightAbove;
        if (!refOperationTable.current || !refThead.current) {
            newHeightAbove = 0;
        } else {
            newHeightAbove = refOperationTable.current.offsetTop + refThead.current.scrollHeight;
        }
        if (heightAbove !== newHeightAbove) {
            setHeightAbove(newHeightAbove);
        }
    }, [heightAbove, refOperationTable, refThead, setHeightAbove]);

    const asOf = $t('client.operations.as_of');
    let lastCheckDate = formatDate.toShortString(view.lastCheckDate);
    lastCheckDate = `${asOf} ${lastCheckDate}`;

    const lastCheckDateTooltip = `${$t(
        'client.operations.last_sync_full'
    )} ${formatDate.toLongString(view.lastCheckDate)}`;

    const { balance, outstandingSum, formatCurrency } = view;

    let syncButton;
    if (view.driver.config.showSync) {
        assert(view.account !== null, 'must have an account if we show the sync button');
        syncButton = (
            <li>
                <SyncButton account={view.account} />
            </li>
        );
    }

    return (
        <>
            <div className="account-summary">
                <span className="icon">
                    <span className="fa fa-balance-scale" />
                </span>

                <div>
                    <p className="main-balance">
                        <span className="label">
                            <span className="balance-text">
                                {$t('client.operations.current_balance')}
                            </span>
                            <span className="separator">&nbsp;</span>
                            <span className="date">{lastCheckDate}</span>
                            <span
                                className="tooltipped tooltipped-sw tooltipped-multiline"
                                aria-label={lastCheckDateTooltip}>
                                <span className="fa fa-question-circle clickable" />
                            </span>
                        </span>
                        <span className="amount">{formatCurrency(balance)}</span>
                    </p>

                    <DisplayIf condition={outstandingSum !== 0}>
                        <p>
                            <span className="label">{$t('client.menu.outstanding_sum')}</span>
                            <span className="amount">{formatCurrency(outstandingSum)}</span>
                        </p>

                        <p>
                            <span className="label">{$t('client.menu.outstanding_balance')}</span>
                            <span className="amount">
                                {formatCurrency(balance + outstandingSum)}
                            </span>
                        </p>
                    </DisplayIf>
                </div>
            </div>

            <div className="operation-toolbar">
                <ul>
                    <li>
                        <SearchButton />
                    </li>

                    {syncButton}

                    <DisplayIf condition={view.driver.config.showAddTransaction}>
                        <li>
                            <ButtonLink
                                to={TransactionUrls.new.url(view.driver)}
                                aria={$t('client.operations.add_operation')}
                                icon="plus"
                                label={$t('client.operations.add_operation')}
                            />
                        </li>
                    </DisplayIf>

                    <IfNotMobile>
                        <li>
                            <BulkEditButton
                                isActive={inBulkEditMode}
                                handleClick={toggleBulkEditMode}
                            />
                        </li>
                    </IfNotMobile>
                </ul>
                <SearchComponent minAmount={minAmount} maxAmount={maxAmount} />
            </div>

            <DisplayIf condition={filteredTransactionsItems.length === 0}>
                <p className="alerts info">
                    {$t('client.operations.no_transaction_found')}
                    <DisplayIf condition={hasSearchFields}>
                        {` ${$t('client.operations.broaden_search')}`}
                    </DisplayIf>
                </p>
            </DisplayIf>

            <DisplayIf condition={filteredTransactionsItems.length > 0}>
                <DisplayIf condition={hasSearchFields}>
                    <ul className="search-summary">
                        <li className="received">
                            <span className="fa fa-arrow-down" />
                            <span>{$t('client.operations.received')}</span>
                            <span>{positiveSum}</span>
                        </li>

                        <li className="spent">
                            <span className="fa fa-arrow-up" />
                            <span>{$t('client.operations.spent')}</span>
                            <span>{negativeSum}</span>
                        </li>

                        <li className="saved">
                            <span className="fa fa-database" />
                            <span>{$t('client.operations.saved')}</span>
                            <span>{wellSum}</span>
                        </li>
                    </ul>
                </DisplayIf>

                <table className="operation-table" ref={refOperationTable}>
                    <thead ref={refThead}>
                        <tr>
                            <IfNotMobile>
                                <th className="details-button" />
                            </IfNotMobile>
                            <th className="date">{$t('client.operations.column_date')}</th>
                            <IfNotMobile>
                                <th className="type">{$t('client.operations.column_type')}</th>
                            </IfNotMobile>
                            <th className="label">{$t('client.operations.column_name')}</th>
                            <th className="amount">{$t('client.operations.column_amount')}</th>
                            <IfNotMobile>
                                <th className="category">
                                    {$t('client.operations.column_category')}
                                </th>
                            </IfNotMobile>
                        </tr>

                        <BulkEditComponent
                            inBulkEditMode={inBulkEditMode}
                            items={bulkEditSelectedSet}
                            setAllStatus={bulkEditSelectAll}
                            setAllBulkEdit={toggleAllBulkItems}
                        />
                    </thead>

                    <InfiniteList
                        ballast={NUM_ITEM_BALLAST}
                        items={filteredTransactionsItems}
                        // renderInfiniteList={renderInfiniteList}
                        itemHeight={transactionHeight}
                        heightAbove={heightAbove}
                        renderItems={renderItems}
                        containerId={CONTAINER_ID}
                        key={view.driver.value}
                    />
                </table>
            </DisplayIf>
        </>
    );
};

function localeContains(where: string, substring: string) {
    const haystack = where.toLowerCase().normalize('NFKC');
    const needle = substring.toLowerCase().normalize('NFKC');
    if (haystack.includes(needle)) {
        return true;
    }
    const needleLength = needle.length;
    const max = Math.max(haystack.length - needleLength + 1, 0);
    for (let i = 0; i < max; ++i) {
        let match = true;
        for (let j = 0; j < needleLength; ++j) {
            const cur = haystack[i + j];
            if (cur === ' ') {
                // Skip to the next word in the haystack.
                i += j;
                match = false;
                break;
            } else if (localeComparator(needle[j], cur) !== 0) {
                match = false;
                break;
            }
        }
        if (match) {
            return true;
        }
    }
    return false;
}

// Returns operation ids.
function filterOperationsThisMonth(state: GlobalState, transactionIds: number[]) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    return transactionIds.filter(id => {
        const op = get.operationById(state, id);
        return (
            op.budgetDate.getFullYear() === currentYear && op.budgetDate.getMonth() === currentMonth
        );
    });
}

function computeMinMax(state: GlobalState, transactionIds: number[]) {
    let min = Infinity;
    let max = -Infinity;
    for (const id of transactionIds) {
        const op = get.operationById(state, id);
        if (op.amount < min) {
            min = op.amount;
        }
        if (op.amount > max) {
            max = op.amount;
        }
    }
    // Round the values to the nearest integer.
    min = Math.floor(min);
    max = Math.ceil(max);
    return [min, max];
}

function computeTotal(
    state: GlobalState,
    filterFunction: (op: Operation) => boolean,
    transactionIds: number[]
) {
    const total = transactionIds
        .map(id => get.operationById(state, id))
        .filter(filterFunction)
        .reduce((a, b) => a + b.amount, 0);
    return Math.round(total * 100) / 100;
}

export default Reports;

export const testing = {
    localeContains,
};
