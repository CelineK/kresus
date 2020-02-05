import {
    getRepository,
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    Repository
} from 'typeorm';

import User from './users';
import Access from './accesses';

import { assert, unwrap } from '../../helpers';

@Entity()
export default class AccessFields {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        type => User,
        { cascade: true, onDelete: 'CASCADE', nullable: false }
    )
    @JoinColumn()
    user!: User;

    @Column('integer')
    userId!: number;

    // The access unique identifier of the access the field is attached to.
    @ManyToOne(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        type => Access,
        access => access.fields,
        { cascade: true, onDelete: 'CASCADE', nullable: false }
    )
    @JoinColumn()
    access!: Access;

    @Column('integer')
    accessId!: number;

    // The name of the field.
    @Column('varchar')
    name!: string;

    // The value of the field.
    @Column('varchar')
    value!: string;

    static async create(userId: number, attributes: Partial<AccessFields>): Promise<AccessFields> {
        const { accessId } = attributes;
        assert(
            typeof accessId === 'number',
            'AccessFields.create second arg should have "accessId" id property'
        );
        const entity = repo().create(Object.assign({}, attributes, { userId }));
        return await repo().save(entity);
    }

    static async find(userId, fieldId): Promise<AccessFields | undefined> {
        return await repo().findOne({ where: { id: fieldId, userId } });
    }

    static async all(userId): Promise<AccessFields[]> {
        return await repo().find({ userId });
    }

    static async exists(userId, fieldId): Promise<boolean> {
        const found = await repo().findOne({ where: { userId, id: fieldId } });
        return !!found;
    }

    static async destroy(userId, fieldId): Promise<void> {
        await repo().delete({ userId, id: fieldId });
    }

    static async destroyAll(userId): Promise<void> {
        await repo().delete({ userId });
    }

    static async update(userId, fieldId, attributes): Promise<AccessFields> {
        await repo().update({ userId, id: fieldId }, attributes);
        const updated = await AccessFields.find(userId, fieldId);
        return unwrap(updated);
    }

    // TODO optimize with SQL?
    static async batchCreate(userId, accessId, fields): Promise<AccessFields[]> {
        assert(
            typeof accessId === 'number',
            'AccessFields.batchCreate second arg should be an id "accessId"'
        );
        assert(fields instanceof Array, 'AccessFields.batchCreate third arg should be an array.');

        const fieldsFromDb: AccessFields[] = [];
        for (const field of fields) {
            fieldsFromDb.push(await AccessFields.create(userId, { ...field, accessId }));
        }
        return fieldsFromDb;
    }

    static async allByAccessId(userId, accessId): Promise<AccessFields[]> {
        assert(
            typeof accessId === 'number',
            'AccessFields.allByAccessId second arg should be an id "accessId".'
        );
        return await repo().find({ accessId, userId });
    }

    static async updateOrCreateByAccessIdAndName(
        userId,
        accessId,
        name,
        value
    ): Promise<AccessFields> {
        // TODO optimize with upsert() if available?
        const field = await repo().find({ userId, accessId, name });
        if (field instanceof Array && field.length) {
            assert(field.length === 1, 'more than one value set for a given custom field');
            return await AccessFields.update(userId, field[0].id, { value });
        }

        return await AccessFields.create(userId, { name, value, accessId });
    }

    static async batchUpdateOrCreate(userId, accessId, fields = []): Promise<AccessFields[]> {
        assert(
            fields instanceof Array,
            'AccessFields.batchUpdateOrCreate third arg must be an array.'
        );
        for (const { name, value, id: fieldId } of fields) {
            if (value === null) {
                await AccessFields.destroy(userId, fieldId);
                continue;
            }
            await AccessFields.updateOrCreateByAccessIdAndName(userId, accessId, name, value);
        }
        return await AccessFields.allByAccessId(userId, accessId);
    }
}

let REPO: Repository<AccessFields> | null = null;
function repo(): Repository<AccessFields> {
    if (REPO === null) {
        REPO = getRepository(AccessFields);
    }
    return REPO;
}
