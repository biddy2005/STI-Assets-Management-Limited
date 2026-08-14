const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const {
  requireRole
} = require(
  '../middleware/auth.middleware'
);


function createResponse() {
  return {
    statusCode:
      null,

    body:
      null,

    redirectPath:
      null,


    status(code) {
      this.statusCode =
        code;

      return this;
    },


    send(body) {
      this.body =
        body;

      return this;
    },


    redirect(path) {
      this.redirectPath =
        path;

      return this;
    }
  };
}


test(
  'requireRole redirects an unauthenticated request',
  () => {
    const req = {
      session: {}
    };

    const res =
      createResponse();

    let nextCalled =
      false;


    requireRole(
      'SUPERADMIN'
    )(
      req,
      res,
      () => {
        nextCalled =
          true;
      }
    );


    assert.equal(
      res.redirectPath,
      '/admin/login'
    );

    assert.equal(
      nextCalled,
      false
    );
  }
);


test(
  'EDITOR cannot enter a SUPERADMIN-only route',
  () => {
    const req = {
      session: {
        adminId:
          1,

        adminRole:
          'EDITOR'
      }
    };

    const res =
      createResponse();

    let nextCalled =
      false;


    requireRole(
      'SUPERADMIN'
    )(
      req,
      res,
      () => {
        nextCalled =
          true;
      }
    );


    assert.equal(
      res.statusCode,
      403
    );

    assert.equal(
      nextCalled,
      false
    );
  }
);


test(
  'EDITOR can enter a content-management route',
  () => {
    const req = {
      session: {
        adminId:
          1,

        adminRole:
          'EDITOR'
      }
    };

    const res =
      createResponse();

    let nextCalled =
      false;


    requireRole(
      'SUPERADMIN',
      'EDITOR'
    )(
      req,
      res,
      () => {
        nextCalled =
          true;
      }
    );


    assert.equal(
      nextCalled,
      true
    );
  }
);


test(
  'SUPERADMIN can enter a SUPERADMIN-only route',
  () => {
    const req = {
      session: {
        adminId:
          1,

        adminRole:
          'SUPERADMIN'
      }
    };

    const res =
      createResponse();

    let nextCalled =
      false;


    requireRole(
      'SUPERADMIN'
    )(
      req,
      res,
      () => {
        nextCalled =
          true;
      }
    );


    assert.equal(
      nextCalled,
      true
    );
  }
);