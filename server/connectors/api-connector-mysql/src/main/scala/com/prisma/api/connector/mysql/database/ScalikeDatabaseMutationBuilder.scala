package com.prisma.api.connector.mysql.database

import com.prisma.api.connector.CreateDataItemImport
import org.joda.time.DateTime
import org.joda.time.format.DateTimeFormat
import play.api.libs.json.{JsValue => PlayJsValue}
import spray.json.{JsValue => SprayJsValue}

object ScalikeDatabaseMutationBuilder {
  val implicitlyCreatedColumns = List("id", "createdAt", "updatedAt")

  import scalikejdbc._

  def createDataItem(item: CreateDataItemImport) = {

    val escapedKeyValueTuples = item.args.raw.toList.map(x => (escapeKey(x._1), escapeUnsafeParam(x._2)))

    val columns = combineByComma(escapedKeyValueTuples.map(_._1))
    val values  = ""

    sql"INSERT INTO `${item.project.id}`.`${item.model.name}` (${columns}) VALUES (${columns})".update.apply
  }

  def escapeKey(key: String): SQL[Nothing, NoExtractor] = sql"`$key`"

  def escapeUnsafeParam(param: Any) = {
    def unwrapSome(x: Any): Any = {
      x match {
        case Some(x) => x
        case x       => x
      }
    }
    unwrapSome(param) match {
      case param: String       => sql"$param"
      case param: PlayJsValue  => sql"${param.toString}"
      case param: SprayJsValue => sql"${param.compactPrint}"
      case param: Boolean      => sql"$param"
      case param: Int          => sql"$param"
      case param: Long         => sql"$param"
      case param: Float        => sql"$param"
      case param: Double       => sql"$param"
      case param: BigInt       => sql"#${param.toString}"
      case param: BigDecimal   => sql"#${param.toString}"
      case param: DateTime     => sql"${param.toString(DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ss.SSS").withZoneUTC())}"
      case None                => sql"NULL"
      case null                => sql"NULL"
      case _                   => throw new IllegalArgumentException("Unsupported scalar value in SlickExtensions: " + param.toString)
    }
  }
}
