const express =
  require('express');

const router =
  express.Router();

const prisma =
  require('../config/db');

const {
  requireRole
} = require(
  '../middleware/auth.middleware'
);

const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);


const superAdminOnly =
  requireRole(
    'SUPERADMIN'
  );

router.get(
  '/',

  superAdminOnly,

  asyncHandler(async (
    req,
    res
  ) => {

    /*
     * ==========================================================
     * FILTER VALUES
     * ==========================================================
     */

    const action =
      typeof req.query.action ===
        'string'
        ? req.query.action
            .trim()
            .slice(0, 100)
        : '';


    const entityType =
      typeof req.query.entityType ===
        'string'
        ? req.query.entityType
            .trim()
            .slice(0, 100)
        : '';


    const from =
      typeof req.query.from ===
        'string'
        ? req.query.from.trim()
        : '';


    const to =
      typeof req.query.to ===
        'string'
        ? req.query.to.trim()
        : '';


    const submittedAdminId =
      Number(
        req.query.adminId
      );


    const adminId =
      Number.isSafeInteger(
        submittedAdminId
      ) &&
      submittedAdminId > 0
        ? submittedAdminId
        : null;


    /*
     * ==========================================================
     * PAGINATION
     * ==========================================================
     */

    const submittedPage =
      Number(
        req.query.page
      );


    const requestedPage =
      Number.isInteger(
        submittedPage
      ) &&
      submittedPage > 0
        ? submittedPage
        : 1;


    const pageSize =
      25;


    /*
     * ==========================================================
     * BUILD PRISMA FILTER
     * ==========================================================
     */

    const where = {};


    if (action) {
      where.action =
        action;
    }


    if (entityType) {
      where.entityType =
        entityType;
    }


    if (adminId) {
      where.adminId =
        adminId;
    }


    const createdAtFilter =
      {};


    if (from) {

      const fromDate =
        new Date(
          `${from}T00:00:00.000`
        );


      if (
        !Number.isNaN(
          fromDate.getTime()
        )
      ) {
        createdAtFilter.gte =
          fromDate;
      }

    }


    if (to) {

      const toDate =
        new Date(
          `${to}T23:59:59.999`
        );


      if (
        !Number.isNaN(
          toDate.getTime()
        )
      ) {
        createdAtFilter.lte =
          toDate;
      }

    }


    if (
      Object.keys(
        createdAtFilter
      ).length > 0
    ) {

      where.createdAt =
        createdAtFilter;

    }


    /*
     * Count matching records first so we can calculate
     * a safe page number.
     */
    const totalLogs =
      await prisma.auditLog.count({
        where
      });


    const totalPages =
      Math.max(
        1,
        Math.ceil(
          totalLogs /
          pageSize
        )
      );


    const currentPage =
      Math.min(
        requestedPage,
        totalPages
      );


    const skip =
      (
        currentPage - 1
      ) *
      pageSize;


    /*
     * ==========================================================
     * RETRIEVE PAGE + FILTER OPTIONS
     * ==========================================================
     */

    const [
      auditLogs,
      actionOptions,
      admins,
      entityTypeOptions
    ] =
      await Promise.all([

        prisma.auditLog.findMany({

          where,

          include: {

            admin: {

              select: {
                id:
                  true,

                email:
                  true
              }

            }

          },

          orderBy: {
            createdAt:
              'desc'
          },

          skip,

          take:
            pageSize

        }),


        prisma.auditLog.findMany({

          select: {
            action:
              true
          },

          distinct: [
            'action'
          ],

          orderBy: {
            action:
              'asc'
          }

        }),


        prisma.admin.findMany({

          select: {
            id:
              true,

            email:
              true
          },

          orderBy: {
            email:
              'asc'
          }

        }),


        prisma.auditLog.findMany({

          where: {

            entityType: {
              not:
                null
            }

          },

          select: {
            entityType:
              true
          },

          distinct: [
            'entityType'
          ],

          orderBy: {
            entityType:
              'asc'
          }

        })

      ]);


    return res.render(
      'admin/audit-logs',
      {
        auditLogs,

        actionOptions:
          actionOptions.map(
            (item) =>
              item.action
          ),

        admins,

        entityTypeOptions:
          entityTypeOptions
            .map(
              (item) =>
                item.entityType
            )
            .filter(Boolean),

        filters: {
          action,

          adminId:
            adminId
              ? String(
                  adminId
                )
              : '',

          entityType,

          from,

          to
        },

        pagination: {
          currentPage,

          totalPages,

          pageSize,

          totalLogs
        }

      }
    );

  })
);

module.exports =
  router;