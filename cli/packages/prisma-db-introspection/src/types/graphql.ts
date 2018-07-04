// GraphQL types that satisfy Prisma ID constraints
const validIdTypes: string[] = ["ID", "Int"]

export class GQLType {
  name: string
  fields: GQLField[]
  directives: string[]
  renderCommented: boolean

  constructor(name: string, fields: GQLField[], directives: string[], renderCommented: boolean) {
    this.name = name
    this.fields = fields
    this.directives = directives
    this.renderCommented = this.renderCommented
  }

  // Determines if this type is valid GraphQL compatible with Prisma
  isValid(): boolean {
    return this.fields.some(f => f.isValidPrismaId())
  }

  addField(field: GQLField) {
    this.fields.push(field)
  }

  render(): string {
    const orderFields = (fields: GQLField[]): GQLField[] => {
      return fields.sort((a, b) => {
        if (a.name < b.name) { return -1 }
        if (a.name > b.name) { return 1 }
        return 0
      })
    }

    if (!this.isValid() || this.renderCommented) {
      this.fields.forEach(f => f.renderCommented = true)
    }

    // Dissect fields
    const idField = this.fields.find(x => x.isIdField) || null
    const relationFields: GQLField[] = [] // orderFields
    const scalarFields = orderFields(this.fields.filter(f => !f.isIdField && f.relation === null))

    // Render fields
    const renderedFields = scalarFields.map(f => f.render())
    if (idField !== null) {
      renderedFields.unshift(idField.render())
    }

    relationFields.map(f => f.render()).forEach(r => renderedFields.push(r))

    // Render type
    return `${this.renderCommented ? "# " : ""}type ${capitalizeFirstLetter(this.name)} ${this.directives.join(" ")} {
      ${renderedFields}
    ${this.renderCommented ? "# " : ""}}`
  }
}

export class GQLField {
  name: string
  type: string
  isRequired: boolean
  directives: string[]
  isIdField: boolean
  comment: string
  renderCommented: boolean
  relation: GQLRelation | null

  constructor(name: string, type: string, isRequired: boolean, directives: string[],
    isIdField: boolean, comment: string, renderCommented: boolean, relation: GQLRelation) {
    this.name = name
    this.type = type
    this.isRequired = isRequired
    this.directives = directives
    this.isIdField = isIdField
    this.comment = comment
    this.renderCommented = this.renderCommented
  }

  isValid(): boolean {
    return true
  }

  isValidPrismaId(): boolean {
    return this.isIdField && validIdTypes.includes(this.type) && this.isRequired
  }

  render(): string {
    const prefix = (!this.isValid() || this.renderCommented) ? "# " : ""
    const suffix = (this.comment.length > 0) ? `# ${this.comment}` : ''
    const directives = this.directives.join(" ")

    return `${prefix}${this.name}${this.type}${this.isRequired ? '!' : ''}${suffix}`
  }
}

export class GQLRelation {
  targetType: GQLType

  constructor(targetType: GQLType) {
    this.targetType = targetType
  }
}

export class SDL {
  types: GQLType[]

  constructor(types: GQLType[]) {
    this.types = types
  }

  render(): string {
    const orderedTypes = this.types.sort((a, b) => {
      if (a.name < b.name) { return -1 }
      if (a.name > b.name) { return 1 }
      return 0
    })

    return orderedTypes.map(t => t.render()).join("\n\n")
  }
}

// Utilities

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

function lowerCaseFirstLetter(string) {
  return string.charAt(0).toLowerCase() + string.slice(1)
}

function removeIdSuffix(string) {
  function removeSuffix(suffix, string) {
    if (string.endsWith(suffix)) {
      return string.substring(0, string.length - suffix.length)
    } else {
      return string
    }
  }

  return removeSuffix('_ID', removeSuffix('_id', removeSuffix('Id', string)))
}