const prisma =
  require('../config/db');

function cleanUserAgent(
  value
) {
  if (
    typeof value !== 'string'
  ) {
    return null;
  }

  return value
    .replace(
      /[\r\n]+/g,
      ' '
    )
    .trim()
    .slice(
      0,
      500
    );
}

function prepareMetadata(
  metadata
) {
  if (
    metadata === null ||
    metadata === undefined
  ) {
    return undefined;
  }

  /*
   * Converts Date objects and removes undefined values.
   */
  return JSON.parse(
    JSON.stringify(
      metadata
    )
  );
}

async function writeAuditLog({
  client = prisma,
  req,
  action,
  entityType = null,
  entityId = null,
  metadata = null,
  adminId
}) {
  const resolvedAdminId =
    adminId !== undefined
      ? adminId
      : req.session?.adminId ||
        null;

  return client.auditLog.create({
    data: {
      adminId:
        resolvedAdminId,

      action,

      entityType,

      entityId:
        entityId === null ||
        entityId === undefined
          ? null
          : String(
              entityId
            ),

      ipAddress:
        req.ip ||
        req.socket
          ?.remoteAddress ||
        null,

      userAgent:
        cleanUserAgent(
          req.get(
            'user-agent'
          )
        ),

      metadata:
        prepareMetadata(
          metadata
        )
    }
  });
}

module.exports = {
  writeAuditLog
};