import {
  Table,
  Column,
  TypeIdentifier,
  Relation,
  PrimaryKey,
  ForeignKey,
  PostgresConnectionDetails,
} from '../types/common'
import * as _ from 'lodash'
import { Client } from 'pg'

export class PostgresConnector {
  client
  connectionPromise

  constructor(connectionDetails: PostgresConnectionDetails) {
    this.client = new Client(connectionDetails)
    this.connectionPromise = this.client.connect()
    // auto disconnect. end waits for queries to succeed
    setTimeout(() => {
      this.client.end()
    }, 3000)
  }

  async queryRelations(schemaName: string): Promise<Relation[]> {
    const res = await this.client.query(
      `SELECT source_table_name,
              source_attr.attname AS source_column,
              target_table_name,
              target_attr.attname AS target_column
      FROM pg_attribute target_attr, pg_attribute source_attr,
      (
        SELECT source_table_name, target_table_name, source_table_oid, target_table_oid, source_constraints[i] source_constraints, target_constraints[i] AS target_constraints
        FROM
        (
          SELECT pgc.relname as source_table_name, pgct.relname as target_table_name, conrelid as source_table_oid, confrelid AS target_table_oid, conkey AS source_constraints, confkey AS target_constraints, generate_series(1, array_upper(conkey, 1)) AS i
          FROM pg_constraint as pgcon 
            LEFT JOIN pg_class as pgc ON pgcon.conrelid = pgc.oid -- source table
            LEFT JOIN pg_namespace as pgn ON pgc.relnamespace = pgn.oid
            LEFT JOIN pg_class as pgct ON pgcon.confrelid = pgct.oid -- target table
            LEFT JOIN pg_namespace as pgnt ON pgct.relnamespace = pgnt.oid
          WHERE contype = 'f'
          AND pgn.nspname = $1::text 
          AND pgnt.nspname = $1::text 
        ) query1
      ) query2
      WHERE target_attr.attnum = target_constraints AND target_attr.attrelid = target_table_oid
      AND   source_attr.attnum = source_constraints AND source_attr.attrelid = source_table_oid;`,
      [schemaName.toLowerCase()]
    )

    return res.rows.map(row => {
      return {
        source_table: row.source_table_name,
        source_column: row.source_column,
        target_table: row.target_table_name,
        target_column: row.target_column
      }
    }) as Relation[]
  }

  // Queries all columns of all tables in given schema and returns them grouped by table_name
  async queryTables(schemaName: string) {
    const res = await this.client.query(
      `SELECT *, (SELECT EXISTS(
         SELECT *
         FROM information_schema.table_constraints AS tc 
         JOIN information_schema.key_column_usage AS kcu
           ON tc.constraint_name = kcu.constraint_name
         WHERE constraint_type = 'UNIQUE' 
         AND tc.table_schema = $1::text
         AND tc.table_name = c.table_name
         AND kcu.column_name = c.column_name)) as is_unique
       FROM  information_schema.columns c
       WHERE table_schema = $1::text`,
      [schemaName.toLowerCase()]
    )

    return _.groupBy(res.rows, 'table_name')
  }

  async queryPrimaryKeys(schemaName: string): Promise<PrimaryKey[]> {
    return this.client.query(
      `SELECT tc.table_name, kc.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kc 
         ON kc.table_name = tc.table_name 
         AND kc.table_schema = tc.table_schema
         AND kc.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'PRIMARY KEY'
       AND tc.table_schema = $1::text
       AND kc.ordinal_position IS NOT NULL
       ORDER BY tc.table_name, kc.position_in_unique_constraint;`,
      [schemaName.toLowerCase()]
    ).then(keys => {
      const grouped = _.groupBy(keys.rows, 'table_name')
      return _.map(grouped, (pks, key) => {
        return {
          tableName: key,
          fields: pks.map(x => x.column_name)
        } as PrimaryKey
      })
    })
  }

  // async queryForeignKeys(schemaName: string): Promise<ForeignKey[]> {
  //   return this.client.query(
  //     `SELECT tc.table_name, kc.column_name, kc.constraint_name
  //      FROM information_schema.table_constraints tc
  //      JOIN information_schema.key_column_usage kc 
  //        ON kc.table_name = tc.table_name 
  //        AND kc.table_schema = tc.table_schema
  //        AND kc.constraint_name = tc.constraint_name
  //      WHERE tc.constraint_type = 'FOREIGN KEY'
  //      AND tc.table_schema = $1::text
  //      and kc.position_in_unique_constraint is not null
  //      ORDER BY tc.table_name, kc.position_in_unique_constraint;`,
  //     [schemaName.toLowerCase()]
  //   ).then(keys => {
  //     return keys.rows.map(key => {
  //       return {
  //         tableName: key.table_name,
  //         field: key.column_name
  //       } as ForeignKey
  //     })
  //   })
  // }

  async querySchemas() {
    const res = await this.client.query(
      `select schema_name from information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name NOT LIKE 'information_schema';`
    )

    return res.rows.map(x => x.schema_name)
  }

  // extractRelation(table, column, relations) {
  //   const candidate = relations.find(
  //     relation =>
  //       relation.table_name === table && relation.column_name === column
  //   )

  //   if (candidate) {
  //     return {
  //       table: candidate.foreign_table_name,
  //     }
  //   } else {
  //     return null
  //   }
  // }

  async listSchemas(): Promise<string[]> {
    await this.connectionPromise
    return await this.querySchemas()
  }

  async listTables(schemaName: string): Promise<Table[]> {
    await this.connectionPromise

    const [relations, tableRows, primaryKeys] = await Promise.all([
      this.queryRelations(schemaName),
      this.queryTables(schemaName),
      this.queryPrimaryKeys(schemaName)
    ])

    const tables = _.map(tableRows, (originalColumns, tableName) => {
      const tablePrimaryKey = primaryKeys.find(pk => pk.tableName === tableName) || null
      const tableRelations = relations.filter(rel => rel.source_table === tableName)
      const columns = _.map(originalColumns, column => {
        // Ignore composite keys for now
        const isPk = Boolean(tablePrimaryKey
          && tablePrimaryKey.fields.length == 1
          && Boolean(tablePrimaryKey.fields.includes(column.column_name))
        )

        const { typeIdentifier, comment, error } = this.toTypeIdentifier(
          column.data_type,
          column.column_name,
          isPk
        )

        const rel = tableRelations.find(rel => rel.source_column === column.column_name) || null

        const col = {
          isUnique: column.is_unique || isPk,
          isPrimaryKey: isPk,
          relation: rel,
          defaultValue: this.parseDefaultValue(column.column_default),
          name: column.column_name,
          type: column.data_type,
          typeIdentifier,
          comment,
          nullable: column.is_nullable === 'YES',
        } as Column

        return col
      }).filter(x => x != null) as Column[]

      const sortedColumns = _.sortBy(columns.filter(c => !c.isPrimaryKey), x => x.name)
      const primaryKeyCol = columns.find(c => c.isPrimaryKey)
      if (primaryKeyCol) {
        sortedColumns.unshift(primaryKeyCol)
      }

      // Table is a join table if:
      // - It has 2 relations that are not self-relations
      // - It has no primary key (Prisma doesn't handle join tables with keys)
      // - It has only other fields that are nullable or have default values (Prisma doesn't set other fields on join tables)
      const isJoinTable = tableRelations.filter(rel => rel.target_table !== tableName).length === 2 &&
        !sortedColumns.some(c => !c.isPrimaryKey) &&
        !sortedColumns.filter(c => !c.relation !== null).some(c => !c.nullable && (c.defaultValue === null))

      return {
        name: tableName,
        columns: sortedColumns,
        relations: tableRelations,
        isJoinTable: isJoinTable,
        hasPrimaryKey: sortedColumns.some(x => { return x.isPrimaryKey })
      }
    })

    return _.sortBy(tables, x => x.name)
  }

  parseDefaultValue(string) {
    if (string == null) {
      return null
    }

    if (string.includes(`nextval('`)) {
      return '[AUTO INCREMENT]'
    }

    if (string.includes('now()') || string.includes("'now'::text")) {
      return null
    }

    if (string.includes('::')) {
      const candidate = string.split('::')[0]
      const withoutSuffix = candidate.endsWith(`'`)
        ? candidate.substring(0, candidate.length - 1)
        : candidate
      const withoutPrefix = withoutSuffix.startsWith(`'`)
        ? withoutSuffix.substring(1, withoutSuffix.length)
        : withoutSuffix

      if (withoutPrefix === "NULL") {
        return null
      }

      return withoutPrefix
    }

    return string
  }

  toTypeIdentifier(
    type: string,
    field: string,
    isPrimaryKey: boolean
  ): {
      typeIdentifier: TypeIdentifier | null
      comment: string | null
      error: string | null
    } {
    if (
      isPrimaryKey &&
      (type === 'character' ||
        type === 'character varying' ||
        type === 'text' ||
        type == 'uuid')
    ) {
      return { typeIdentifier: 'ID', comment: null, error: null }
    }

    if (type === 'uuid') {
      return { typeIdentifier: 'String', comment: null, error: null }
    }
    if (type === 'character') {
      return { typeIdentifier: 'String', comment: null, error: null }
    }
    if (type === 'character varying') {
      return { typeIdentifier: 'String', comment: null, error: null }
    }
    if (type === 'text') {
      return { typeIdentifier: 'String', comment: null, error: null }
    }
    if (type === 'smallint') {
      return { typeIdentifier: 'Int', comment: null, error: null }
    }
    if (type === 'integer') {
      return { typeIdentifier: 'Int', comment: null, error: null }
    }
    if (type === 'bigint') {
      return { typeIdentifier: 'Int', comment: null, error: null }
    }
    if (type === 'real') {
      return { typeIdentifier: 'Float', comment: null, error: null }
    }
    if (type === 'double precision') {
      return { typeIdentifier: 'Float', comment: null, error: null }
    }
    if (type === 'numeric') {
      return { typeIdentifier: 'Float', comment: null, error: null }
    }
    if (type === 'boolean') {
      return { typeIdentifier: 'Boolean', comment: null, error: null }
    }
    if (type === 'timestamp without time zone') {
      return { typeIdentifier: 'DateTime', comment: null, error: null }
    }
    if (type === 'timestamp with time zone') {
      return { typeIdentifier: 'DateTime', comment: null, error: null }
    }
    if (type === 'timestamp') {
      return { typeIdentifier: 'DateTime', comment: null, error: null }
    }
    if (type === 'json') {
      return { typeIdentifier: 'Json', comment: null, error: null }
    }
    if (type === 'date') {
      return { typeIdentifier: 'DateTime', comment: null, error: null }
    }

    return {
      typeIdentifier: null,
      comment: `Type '${type}' is not yet supported.`,
      error: `Not able to handle type '${type}'`,
    }
  }
}
