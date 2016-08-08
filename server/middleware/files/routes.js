const convert = require(`koa-convert`);
const body = require(`koa-body`);
const fs = require(`fs-promise`);
const Promise = require(`bluebird`);
const bsync = require(`asyncawait/async`);
const bwait = require(`asyncawait/await`);

const Response = require(`../helpers/response`);

/**
 * Handle all file upload requests for the Conductor + '/upload' endpoint
 */
const uploadFile = (self) => {
  const requestDescription = 'Upload File';
  // Populate this array with file objects for every file that is successfully uploaded
  self.router.post(
    `${self.routeEndpoint}/`,
    convert(body({ multipart: true, formidable: { uploadDir: self.uploadDir } })),
    bsync((ctx) => {
      const uploadedFiles = [];
      try {
        const files = ctx.request.body.files;
        if (files === undefined) {
          const errorMessage = `No file was received.`;
          throw errorMessage;
        }
        // Rename each file to be its filename plus a uuid
        // Iterate through every single file in the 'files' object
        bwait(Promise.map(
          Object.keys(files),
          bsync((theFile) => {
            // If multiple files are passed with the same key, they are an Array
            if (Array.isArray(files[theFile])) {
              bwait(Promise.map(
                files[theFile],
                bsync((file) => {
                  uploadedFiles.push(bwait(self.createFile(file)));
                }),
                { concurrency: 5 }
              ));
            } else {
              uploadedFiles.push(bwait(self.createFile(files[theFile])));
            }
          }),
          { concurrency: 5 }
        ));
        ctx.status = 200;
        ctx.body = new Response(ctx, requestDescription, uploadedFiles);
      } catch (ex) {
        ctx.status = 500;
        ctx.body = new Response(ctx, requestDescription, ex);
        self.logger.error(ex);
      }
    })
  );
};

/**
 * Handle all logic at this endpoint for deleting a file
 */
const deleteFile = (self) => {
  const requestDescription = 'Delete File';
  self.router.delete(self.routeEndpoint, bsync((ctx) => {
    try {
      const fileUuid = ctx.request.body.uuid;
      if (fileUuid === undefined) {
        const errorMessage = `"uuid" of file is not provided`;
        throw errorMessage;
      }
      const reply = bwait(self.deleteFile(fileUuid));
      ctx.status = 200;
      ctx.body = new Response(ctx, requestDescription, reply);
    } catch (ex) {
      ctx.status = 500;
      ctx.body = new Response(ctx, requestDescription, ex);
      self.logger.error(ex);
    }
  }));
};

/**
 * Handle all logic at this endpoint for reading all of the tasks
 */
const getFiles = (self) => {
  const requestDescription = 'Get Files';
  self.router.get(`${self.routeEndpoint}/`, bsync((ctx) => {
    try {
      ctx.status = 200;
      ctx.body = new Response(ctx, requestDescription, self.fileList);
    } catch (ex) {
      ctx.status = 500;
      ctx.body = new Response(ctx, requestDescription, ex);
      self.logger.error(ex);
    }
  }));
};

/**
 * Handle all logic at this endpoint for reading a single task
 */
const getFile = (self) => {
  const requestDescription = 'Get File';
  self.router.get(`${self.routeEndpoint}/:uuid`, bsync((ctx) => {
    try {
      // Parse the file's uuid
      const fileUuid = ctx.params.uuid;
      if (fileUuid === undefined) {
        const errorMessage = `uuid of file is not defined`;
        throw errorMessage;
      }
      // Load the file from the list of files
      const file = self.fileList[fileUuid];
      if (file === undefined) {
        const errorMessage = `File ${fileUuid} not found`;
        throw errorMessage;
      }
      ctx.status = 200;
      ctx.body = new Response(ctx, requestDescription, file);
    } catch (ex) {
      ctx.status = 500;
      ctx.body = new Response(ctx, requestDescription, ex);
      self.logger.error(ex);
    }
  }));
};

/**
 * Handle all logic at this endpoint for reading a single task
 */
const downloadFile = (self) => {
  self.router.get(`${self.routeEndpoint}/:uuid/download`, bsync((ctx) => {
    const requestDescription = 'Download File';
    try {
      // Parse the file's uuid
      const fileUuid = ctx.params.uuid;
      if (fileUuid === undefined) {
        const errorMessage = `uuid of file is not defined`;
        throw errorMessage;
      }
      // Load the file from the list of files
      const file = self.fileList[fileUuid];
      if (file === undefined) {
        const errorMessage = `File ${fileUuid} not found`;
        throw errorMessage;
      }
      const fileName = file.name;
      ctx.res.setHeader(`Content-disposition`, `attachment; filename=${fileName}`);
      ctx.body = fs.createReadStream(file.filePath);
    } catch (ex) {
      ctx.status = 500;
      ctx.body = new Response(ctx, requestDescription, ex);
      self.logger.error(ex);
    }
  }));
};

/**
 * Handle all logic at this endpoint for deleting all jobs
 */
const deleteAllFiles = (self) => {
  const requestDescription = `Delete All Files`;
  self.router.delete(`${self.routeEndpoint}/all/`, bsync((ctx) => {
    try {
      for (const file in self.fileList) {
        if (self.fileList.hasOwnProperty(file)) {
          bwait(self.deleteFile(self.fileList[file].uuid));
        }
      }
      const status = `All files deleted`;
      ctx.status = 200;
      ctx.body = new Response(ctx, requestDescription, status);
    } catch (ex) {
      ctx.status = 500;
      ctx.body = new Response(ctx, requestDescription, ex);
      self.logger.error(ex);
    }
  }));
};

const filesRoutes = (self) => {
  uploadFile(self);
  deleteFile(self);
  getFiles(self);
  getFile(self);
  downloadFile(self);
  deleteAllFiles(self);
};

module.exports = filesRoutes;