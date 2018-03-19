package com.prisma.api.connector

import com.prisma.api.connector.Types.DataItemFilterCollection
import com.prisma.shared.models.IdType.Id
import com.prisma.shared.models.ModelMutationType.ModelMutationType
import com.prisma.shared.models.{Field, Model, Project, ServerSideSubscriptionFunction}

sealed trait ApiMutaction
sealed trait DatabaseMutaction   extends ApiMutaction
sealed trait SlickMutaction      extends DatabaseMutaction
sealed trait ScalikeMutaction    extends DatabaseMutaction
sealed trait SideEffectMutaction extends ApiMutaction

case class AddDataItemToManyRelationByPath(project: Project, path: Path)   extends DatabaseMutaction
case class CascadingDeleteRelationMutactions(project: Project, path: Path) extends DatabaseMutaction
case class CreateDataItem(project: Project, path: Path, args: CoolArgs) extends DatabaseMutaction {
  val model = path.lastModel
  val where = path.edges match {
    case x if x.isEmpty => path.root
    case x              => x.last.asInstanceOf[NodeEdge].childWhere
  }
  val id = where.fieldValueAsString
}
case class DeleteDataItem(project: Project, path: Path, previousValues: DataItem, id: String)         extends SlickMutaction
case class DeleteDataItemNested(project: Project, path: Path)                                         extends SlickMutaction
case class DeleteDataItems(project: Project, model: Model, whereFilter: DataItemFilterCollection)     extends SlickMutaction
case class DeleteManyRelationChecks(project: Project, model: Model, filter: DataItemFilterCollection) extends SlickMutaction
case class DeleteRelationCheck(project: Project, path: Path)                                          extends SlickMutaction
object DisableForeignKeyConstraintChecks                                                              extends SlickMutaction
object EnableForeignKeyConstraintChecks                                                               extends SlickMutaction
case class NestedConnectRelation(project: Project, path: Path, topIsCreate: Boolean)                  extends SlickMutaction
case class NestedCreateRelation(project: Project, path: Path, topIsCreate: Boolean)                   extends SlickMutaction
case class NestedDisconnectRelation(project: Project, path: Path, topIsCreate: Boolean = false)       extends SlickMutaction
case class SetScalarList(project: Project, path: Path, field: Field, values: Vector[Any])             extends SlickMutaction
case class SetScalarListToEmpty(project: Project, path: Path, field: Field)                           extends SlickMutaction
case class PushToScalarList(project: Project, path: Path, field: Field, values: Vector[Any])          extends SlickMutaction
case class TruncateTable(projectId: String, tableName: String)                                        extends SlickMutaction
case class UpdateDataItem(project: Project, model: Model, id: Id, args: CoolArgs, previousValues: DataItem) extends SlickMutaction {
  // TODO filter for fields which actually did change
  val namesOfUpdatedFields: Vector[String] = args.raw.keys.toVector
}
case class UpdateDataItemByUniqueFieldIfInRelationWith(project: Project, path: Path, args: CoolArgs)                              extends SlickMutaction
case class UpdateDataItemIfInRelationWith(project: Project, path: Path, args: CoolArgs)                                           extends SlickMutaction
case class UpdateDataItems(project: Project, model: Model, updateArgs: CoolArgs, where: DataItemFilterCollection)                 extends SlickMutaction
case class UpsertDataItem(project: Project, path: Path, createWhere: NodeSelector, updatedWhere: NodeSelector, allArgs: CoolArgs) extends SlickMutaction
case class UpsertDataItemIfInRelationWith(
    project: Project,
    path: Path,
    createWhere: NodeSelector,
    createArgs: CoolArgs,
    updateArgs: CoolArgs,
    pathForUpdateBranch: Path
) extends SlickMutaction
case class VerifyConnection(project: Project, path: Path)     extends SlickMutaction
case class VerifyWhere(project: Project, where: NodeSelector) extends SlickMutaction

//Import
case class CreateDataItemImport(project: Project, model: Model, args: CoolArgs) extends ScalikeMutaction

//case class CreateRelationRowImport(project: Project, path: Path, args: CoolArgs) extends ImportMutaction
//pushscalarlist

//Side Effects
case class PublishSubscriptionEvent(project: Project, value: Map[String, Any], mutationName: String) extends SideEffectMutaction
case class ServerSideSubscription(
    project: Project,
    model: Model,
    mutationType: ModelMutationType,
    function: ServerSideSubscriptionFunction,
    nodeId: Id,
    requestId: String,
    updatedFields: Option[List[String]] = None,
    previousValues: Option[DataItem] = None
) extends SideEffectMutaction
