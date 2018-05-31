import { ClientConfig } from 'pg'

export type TypeIdentifier =
  | 'String'
  | 'Int'
  | 'Float'
  | 'Boolean'
  | 'DateTime'
  | 'ID'
  | 'Json' // | 'Enum' | 'Relation'

export interface Relation {
  source_table: string
  target_table: string
  source_column: string
  target_column: string
}

export interface Column {
  name: string
  isPrimaryKey: boolean
  relation: Relation | null
  isUnique: boolean
  defaultValue: any
  type: string
  typeIdentifier: TypeIdentifier
  comment: string | null
  nullable: boolean
}

export interface Table {
  name: string
  isJoinTable: boolean,
  hasPrimaryKey: boolean,
  columns: Column[],
  relations: Relation[]
}

export interface PrimaryKey {
  tableName: string
  fields: string[]
}

export interface ForeignKey {
  tableName: string
  field: string
}

export type PostgresConnectionDetails = string | ClientConfig


