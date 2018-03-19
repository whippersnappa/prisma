package com.prisma.api.connector.mysql.impl

import com.prisma.api.connector.mysql.DatabaseMutactionInterpreter
import com.prisma.api.connector._
import com.prisma.api.connector.mysql.database.ScalikeDatabaseMutationBuilder
import slick.jdbc.MySQLProfile.api._

import scala.concurrent.{ExecutionContext, Future}

case class DatabaseMutactionExecutorImpl(
    clientDb: Database
)(implicit ec: ExecutionContext)
    extends DatabaseMutactionExecutor {

  override def execute(mutactions: Vector[DatabaseMutaction]): Future[Unit] = {
    val slickMutactions = mutactions.collect { case x: SlickMutaction => x }
    val scalikeMutactions = mutactions.collect { case x: ScalikeMutaction => x }

    for {
      _ <- executeScalikeMutactions(scalikeMutactions)
      _ <- executeSlickMutactions(slickMutactions)
    } yield ()

  }

  def executeSlickMutactions(slickMutactions: Vector[SlickMutaction]): Future[Unit] = {
    val slickInterpreters   = slickMutactions.map(interpreterFor)
    val combinedErrorMapper = slickInterpreters.map(_.errorMapper).reduceLeft(_ orElse _)
    val singleAction        = DBIO.seq(slickInterpreters.map(_.action): _*).transactionally
    clientDb
      .run(singleAction)
      .recover {
        case error =>
          val mappedError = combinedErrorMapper.lift(error).getOrElse(error)
          throw mappedError
      }
      .map(_ => ())
  }

  def executeScalikeMutactions(scalikeMutactions: Vector[ScalikeMutaction]): Future[Unit] = {
   val item: D

   ScalikeDatabaseMutationBuilder.createDataItem()




  }

  def interpreterFor(mutaction: SlickMutaction): DatabaseMutactionInterpreter = mutaction match {
    case m: AddDataItemToManyRelationByPath             => AddDataItemToManyRelationByPathInterpreter(m)
    case m: CascadingDeleteRelationMutactions           => CascadingDeleteRelationMutactionsInterpreter(m)
    case m: CreateDataItem                              => CreateDataItemInterpreter(m)
    case m: DeleteDataItem                              => DeleteDataItemInterpreter(m)
    case m: DeleteDataItemNested                        => DeleteDataItemNestedInterpreter(m)
    case m: DeleteDataItems                             => DeleteDataItemsInterpreter(m)
    case m: DeleteManyRelationChecks                    => DeleteManyRelationChecksInterpreter(m)
    case m: DeleteRelationCheck                         => DeleteRelationCheckInterpreter(m)
    case DisableForeignKeyConstraintChecks              => DisableForeignKeyConstraintChecksInterpreter
    case EnableForeignKeyConstraintChecks               => EnableForeignKeyConstraintChecksInterpreter
    case m: NestedConnectRelation                       => NestedConnectRelationInterpreter(m)
    case m: NestedCreateRelation                        => NestedCreateRelationInterpreter(m)
    case m: NestedDisconnectRelation                    => NestedDisconnectRelationInterpreter(m)
    case m: SetScalarList                               => SetScalarListInterpreter(m)
    case m: SetScalarListToEmpty                        => SetScalarListToEmptyInterpreter(m)
    case m: PushToScalarList                            => PushToScalarListInterpreter(m)
    case m: TruncateTable                               => TruncateTableInterpreter(m)
    case m: UpdateDataItem                              => UpdateDataItemInterpreter(m)
    case m: UpdateDataItemByUniqueFieldIfInRelationWith => UpdateDataItemByUniqueFieldIfInRelationWithInterpreter(m)
    case m: UpdateDataItemIfInRelationWith              => UpdateDataItemIfInRelationWithInterpreter(m)
    case m: UpdateDataItems                             => UpdateDataItemsInterpreter(m)
    case m: UpsertDataItem                              => UpsertDataItemInterpreter(m)
    case m: UpsertDataItemIfInRelationWith              => UpsertDataItemIfInRelationWithInterpreter(m)
    case m: VerifyConnection                            => VerifyConnectionInterpreter(m)
    case m: VerifyWhere                                 => VerifyWhereInterpreter(m)
  }
}
