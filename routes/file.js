var config = require('../config.json');
const StvResult = require('../lib/StvResult.js');

const fs = require('fs');
const exec = require('child_process').exec;
const path = require('path');

const multiparty = require('multiparty');
const readline = require('readline');
const mime = require('mime');
const shell = require('shelljs');
const async = require('async');

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('User');
const File = mongoose.model('File');

// // middleware that is specific to this router
router.use(function (req, res, next) {
    var sid = req._sid;
    User.findOne({
        'sessions.id': sid
    }, function (err, user) {
        if (!user) {
            var stvResult = new StvResult();
            stvResult.error = "Authentication error";
            console.log("error: " + stvResult.error);
            stvResult.end();
            res._stvres.response.push(stvResult);
            res.json(res._stvres);
        } else {
            req._user = user;
            next();
        }
    }).select('+password');
});

router.get('/:fileId/delete', function (req, res, next) {
    var stvResult = new StvResult();

    var fileId = req.params.fileId;

    stvResult.id = fileId;

    async.waterfall([
        function (cb) {
            File.findOne({
                '_id': fileId,
                'user': req._user._id
            }, function (err, file) {
                if (!file) {
                    cb("File not exist");
                } else if (file.user.toString() != req._user._id.toString()) {
                    cb("Authentication error");
                } else {
                    File.delete(file._id, function (err) {
                        cb(null);
                    });
                }
            });
        }
    ], function (err) {
        if (err) {
            stvResult.error = err;
            console.log("Error in ws: " + req.originalUrl);
            console.log(err);
        }
        stvResult.end();
        res._stvres.response.push(stvResult);
        next();
    });
});

/* Inmediate descendants */
router.get('/:fileId/list', function (req, res, next) {
    var stvResult = new StvResult();

    var fileId = req.params.fileId;
    var sid = req._sid;
    var type = req.query.type;
    var status = req.query.status;

    stvResult.id = fileId;

    async.waterfall([
        function (cb) {
            File.findOne({
                '_id': fileId,
                'user': req._user._id
            }, function (err, file) {
                if (!file) {
                    cb("File not exist");
                } else if (file.user.toString() != req._user._id.toString()) {
                    cb("Authentication error");
                } else {
                    stvResult.results.push(file);
                    cb(null);
                }
            }).populate({
                path: 'files',
                populate: {
                    path: 'job'
                }
            }).populate('job');
        }
    ], function (err) {
        if (err) {
            stvResult.error = err;
            console.log("Error in ws: " + req.originalUrl);
            console.log(err);
        }
        stvResult.end();
        res._stvres.response.push(stvResult);
        next();
    });

});

/* get file Bean*/
router.get('/:fileId/info', function (req, res, next) {
    var stvResult = new StvResult();

    var fileId = req.params.fileId;
    var sid = req._sid;

    stvResult.id = fileId;

    async.waterfall([
        function (cb) {
            File.findOne({
                "_id": fileId,
                "user": req._user._id
            }, function (err, file) {
                if (!file) {
                    cb("File not exist");
                } else {
                    stvResult.results = [file];
                    cb(null);
                }
            });
        }
    ], function (err) {
        if (err) {
            stvResult.error = err;
            console.log("Error in ws: " + req.originalUrl);
            console.log(err);
        }
        stvResult.end();
        res._stvres.response.push(stvResult);
        next();
    });
});

/* Any descendant */
router.get('/:fileId/files', function (req, res, next) {
    var stvResult = new StvResult();

    var fileId = req.params.fileId;
    var sid = req._sid;

    stvResult.id = fileId;

    async.waterfall([
        function (cb) {
            File.findOne({
                "_id": fileId,
                "user": req._user._id
            }, function (err, file) {
                if (!file) {
                    cb("File not exist")
                } else {
                    File.find({
                        'user': req._user._id,
                        'path': {
                            $regex: new RegExp('^' + file.path)
                        }
                    }, function (err, files) {
                        stvResult.results = files;
                        cb(null);
                    });
                }
            });
        }
    ], function (err) {
        if (err) {
            stvResult.error = err;
            console.log("Error in ws: " + req.originalUrl);
            console.log(err);
        }
        stvResult.end();
        res._stvres.response.push(stvResult);
        next();
    });
});

router.get('/:fileId/create-folder', function (req, res, next) {
    var stvResult = new StvResult();

    var fileId = req.params.fileId;
    var sid = req._sid;
    var name = req.query.name.replace(/[^a-zA-Z0-9._\-]/g, "_");

    stvResult.id = fileId;

    async.waterfall([
        function (cb) {
            File.findOne({
                '_id': fileId,
                'user': req._user._id
            }, function (err, parent) {
                if (!parent) {
                    cb("File not exist");
                } else if (parent.user._id.toString() != req._user._id.toString()) {
                    cb("Authentication error");
                } else {
                    File.createFolder(name, parent, req._user, function (folder) {
                        stvResult.results.push(folder);
                        cb(null);
                    });
                }
            }).populate("user").populate('files');
        }
    ], function (err) {
        if (err) {
            stvResult.error = err;
            console.log("Error in ws: " + req.originalUrl);
            console.log(err);
        }
        stvResult.end();
        res._stvres.response.push(stvResult);
        next();
    });
});

router.get('/:fileId/content', function (req, res, next) {
    var fileId = req.params.fileId;
    var sid = req._sid;

    var start = req.query.start;
    var limit = req.query.limit;

    async.waterfall([
        function (cb) {
            File.findOne({
                '_id': fileId,
                "user": req._user._id
            }, function (err, file) {
                if (!file) {
                    cb("File not exist")
                } else {
                    var filePath = path.join(config.steviaDir, config.usersPath, file.path);
                    getFileLines(filePath, start, limit, function (err, text) {
                        if (err) {
                            cb(err)
                        } else {
                            cb(null, text);
                        }
                    });
                }
            }).populate("user").populate('parent');
        }
    ], function (err, text) {
        if (err) {
            console.log("Error in ws: " + req.originalUrl);
            console.log(err);
            res.send();
        } else {
            res.send(text);
        }
    });
});

function getFileLines(filePath, startParam, limitParam, callback) {
    var start = 0;
    var limit = 0;
    var parsedStart = parseInt(startParam);
    var parsedLimit = parseInt(limitParam);

    if (!isNaN(parsedStart) && parsedStart >= 0) {
        start = parsedStart;
    }
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = parsedLimit;
    }

    var lines = [];
    var lineCount = 0;
    var end = start + limit;
    try {
        const rl = readline.createInterface({
            input: fs.createReadStream(filePath)
        });
        rl.on('line', (line) => {
            if (lineCount >= start) {
                lines.push(line);
            }
            if (limit > 0 && lineCount > end) {
                rl.close()
            }
            lineCount++;
        });
        rl.on('close', function () {
            callback(null, lines.join('\n'));
        });
    } catch (e) {
        callback("Could not read the file");
    }
};

router.get('/content-example', function (req, res, next) {
    var tool = req.query.tool;
    var file = req.query.file;
    var start = req.query.start;
    var limit = req.query.limit;

    var filePath = path.join(config.steviaDir, config.toolsPath, tool, "examples", file);

    async.waterfall([
        function (cb) {
            getFileLines(filePath, start, limit, function (err, text) {
                if (err) {
                    cb(err)
                } else {
                    cb(null, text);
                }
            });
        }
    ], function (err, text) {
        if (err) {
            console.log("Error in ws: " + req.originalUrl);
            console.log(err);
            res.send();
        } else {
            res.send(text);
        }
    });
});

router.get('/:fileId/download', function (req, res, next) {
    var fileId = req.params.fileId;

    async.waterfall([
        function (cb) {
            File.findOne({
                '_id': fileId,
                "user": req._user._id
            }, function (err, file) {
                if (!file) {
                    cb("File not exist");
                } else {
                    try {
                        var filePath = path.join(config.steviaDir, config.usersPath, file.path);
                        res.attachment(filePath);
                        res.sendFile(filePath, {
                            dotfiles: 'allow'
                        });
                        cb(null);
                    } catch (e) {
                        cb("Could not read the file");
                    }

                    cb(null, filePath);
                }
            });
        }
    ], function (err) {
        if (err) {
            console.log("Error in ws: " + req.originalUrl);
            console.log(err);
            res.send();
        }
    });

});

router.get('/download-example', function (req, res, next) {
    var tool = req.query.tool;
    var file = req.query.file;

    async.waterfall([
        function (cb) {
            try {
                var filePath = path.join(config.steviaDir, config.toolsPath, tool, "examples", file);
                res.attachment(filePath);
                res.sendFile(filePath, {
                    dotfiles: 'allow'
                });
                cb(null);
            } catch (e) {
                cb("Could not read the file");
            }
        }
    ], function (err) {
        if (err) {
            console.log("Error in ws: " + req.originalUrl);
            console.log(err);
            res.send();
        }
    });
});

router.post('/:fileId/add-attribute', function (req, res, next) {
    var stvResult = new StvResult();

    var fileId = req.params.fileId;
    stvResult.id = fileId;

    async.waterfall([
        function (cb) {
            File.findOne({
                '_id': fileId,
                'user': req._user._id
            }, function (err, file) {
                if (!file) {
                    cb("File not exist");
                } else if (file.user.toString() != req._user._id.toString()) {
                    cb("Authentication error");
                } else {
                    var newAttributes = req.body;
                    var obj = {};
                    for (var key in file.attributes) {
                        obj[key] = file.attributes[key];
                    }
                    for (var key in newAttributes) {
                        obj[key] = newAttributes[key];
                    }
                    file.attributes = obj;
                    file.save(function (err) {
                        stvResult.results.push(file);
                        cb(null);
                    });
                }
            });
        }
    ], function (err) {
        if (err) {
            stvResult.error = err;
            console.log("Error in ws: " + req.originalUrl);
            console.log(err);
        }
        stvResult.end();
        res._stvres.response.push(stvResult);
        next();
    });
});

//move files
router.get('/move', function (req, res, next) {
    var stvResult = new StvResult();
    var sid = req._sid;
    var fileId = req.query.fileId;
    var newParentId = req.query.newId;
    var files = {};
    files[fileId] = null;
    files[newParentId] = null;

    async.waterfall([
        function (cb) {
            File.find({
                '_id': {
                    $in: Object.keys(files)
                },
                "user": req._user._id
            }, function (err, files) {
                if (err) {
                    cb("File or New Parent not exist");
                } else {
                    for (var i = 0; i < files.length; i++) {
                        var f = files[i];
                        files[f._id] = f;
                    }
                    var file = files[fileId];
                    var newParent = files[newParentId];

                    if (file == null) {
                        cb("File not exist");
                    } else if (newParent == null) {
                        cb("New Parent not exist");
                    } else if (file.job != null && file.job.status != "DONE") {
                        cb("This is a job folder, move action can not be performed until job status becomes DONE.");
                    } else {
                        File.move(file, newParent, function (moveErr) {
                            if (moveErr != null) {
                                cb(moveErr);
                            } else {
                                stvResult.results.push("File moved");
                                req._user.save(function () {
                                    cb(null);
                                });
                            }
                        });
                    }
                }
            }).populate('parent').populate('job');
        }
    ], function (err) {
        if (err) {
            stvResult.error = err;
            console.log("Error in ws: " + req.originalUrl);
            console.log(err);
        }
        stvResult.end();
        res._stvres.response.push(stvResult);
        next();
    });

});

/******************************/
/******** Upload file *********/
/******************************/

/******************************/
/******************************/
router.post('/upload', function (req, res, next) {
    File.findOne({
        '_id': req.query.parentId,
        'user': req._user._id
    }, function (err, parent) {
        if (!parent) {
            res.json({
                error: "File not exist"
            });
        } else if (parent.user.toString() != req._user._id.toString()) {
            res.json({
                error: "Authentication error"
            });
        } else {
            req._parent = parent;
            next();
        }
    }).populate('files');
}, function (req, res, next) {
    var name = req.query.name.replace(/[^a-zA-Z0-9._\-]/g, "_");
    console.log(name);
    var parent = req._parent;

    File.findOne({
        'user': req._user._id,
        'path': path.join(req._parent.path, name).toString()
    }, function (err, file) {
        if (file != null) {
            res.json({
                exists: true,
                file: file
            });
        } else {
            next();
        }

    });

}, function (req, res, next) {
    var fields = {};
    var form = new multiparty.Form({
        // Parts for fields are not emitted when autoFields is on, and likewise parts for files are not emitted when autoFiles is on.
        autoFields: true
    });

    // Fields
    form.on('field', function (name, value) {
        // console.log(name + ': ' + value);
        fields[name] = value;
        if (fields["name"] != null) {
            fields["name"] = fields["name"].replace(/[^a-zA-Z0-9._\-]/g, "_");
        }
    });

    //Files, should be only one;
    form.on('part', function (part) {
        File.findOne({
            '_id': fields.parentId
        }, function (err, parent) {
            var folderPath = path.join(config.steviaDir, config.usersPath, parent.path);
            var uploadPath = path.join(folderPath, fields.name + "_partial");
            try {
                fs.mkdirSync(uploadPath);
            } catch (e) {
                console.log('Upload: ' + uploadPath + ' ' + 'already created');
            }
            var filepath = path.join(uploadPath, fields.chunk_id + "_chunk");
            var writeStream = fs.createWriteStream(filepath);
            part.pipe(writeStream);
            writeStream.on('finish', function () {
                var stats = fs.statSync(filepath);
                console.log('Chunk ' + fields.chunk_id + ' created. Chunk size: ' + stats.size);

                if (fields.last_chunk === 'true') {
                    console.log('Chunk ' + fields.chunk_id + ' is the last');
                    joinAllChunks(folderPath, uploadPath, fields, parent, function (file) {
                        res.json({
                            file: file
                        });
                    })
                } else {
                    res.json({
                        chunkId: fields.chunk_id
                    });
                }
            });
        }).populate("user");
    });

    form.on('close', function () {
        File.findOne({
            '_id': fields.parentId
        }, function (err, parent) {
            var folderPath = path.join(config.steviaDir, config.usersPath, parent.path);
            var uploadPath = path.join(folderPath, fields.name + "_partial");
            if (fields.resume_upload === 'true') {
                var chunkMap = JSON.parse(fields.chunk_map);
                var resumeInfo = getResumeFileInfo(uploadPath, chunkMap);
                if (checkAllIsUploaded(resumeInfo, chunkMap)) {
                    joinAllChunks(folderPath, uploadPath, fields, parent, function (file) {
                        res.json({
                            file: file,
                            resumeInfo: resumeInfo
                        });
                    })
                } else {
                    res.json({
                        resumeInfo: resumeInfo
                    });
                }
            }
        }).populate("user");
    });
    form.on('aborted', function () {
        console.log('File upload: form parse aborted !!!');
    });
    form.parse(req);
});
/******************************/
/******************************/

function joinAllChunks(folderPath, uploadPath, fields, parent, callback) {
    console.log('Joining all chunks...');
    var finalFilePath = path.join(folderPath, fields.name);
    var files = getSortedChunkList(uploadPath);
    var fd = fs.openSync(finalFilePath, 'w');
    fs.closeSync(fd);
    var fd = fs.openSync(finalFilePath, 'a');
    var c = 0;
    for (var i = 0; i < files.length; i++) {
        var file = path.join(uploadPath, files[i]);
        var data = fs.readFileSync(file);
        fs.appendFileSync(fd, data, null);
    }
    fs.closeSync(fd);
    var stats = fs.statSync(finalFilePath);
    console.log('File ' + finalFilePath + ' created. Final size: ' + stats.size);

    if (mime.lookup(finalFilePath).indexOf('text') != -1) {
        shell.sed('-i', /\r\n/g, '\n', finalFilePath);
        shell.sed('-i', /\r/g, '\n', finalFilePath);
    }

    /* Database entry */
    File.createFile(fields.name, parent, parent.user, function (file) {
        file.bioformat = fields.bioFormat;
        shell.rm('-rf', uploadPath);
        console.log('Temporal upload folder ' + uploadPath + ' removed');
        file.save(function (err) {
            callback(file);
        });
    });

};

function getResumeFileInfo(uploadPath, chunkMap) {
    var info = {};
    try {
        fs.accessSync(uploadPath);
        var stats = fs.statSync(uploadPath);
        if (stats.isDirectory()) {
            var filesInFolder = fs.readdirSync(uploadPath);
            for (var i = 0; i < filesInFolder.length; i++) {
                var file = filesInFolder[i];
                var stats = fs.statSync(path.join(uploadPath, file));
                var nameSplit = file.split("_");
                var chunkId = nameSplit[0];
                if (stats.size === chunkMap[chunkId].size) {
                    info[chunkId] = {
                        size: stats.size
                    };
                }
            }
        }
    } catch (e) {
        console.log('Resume upload: ' + e.message);
        console.log('Resume upload: ' + 'Nothing to resume');
    }
    return info;
};

function checkAllIsUploaded(resumeInfo, chunkMap) {
    var allUploaded = true;
    for (var key in chunkMap) {
        if (resumeInfo[key] == null) {
            allUploaded = false;
            break;
        }
    }
    return allUploaded;
};

function getSortedChunkList(uploadPath) {
    var files, chunkId, file, nameSplit;
    try {
        fs.accessSync(uploadPath);
        var stats = fs.statSync(uploadPath);
        if (stats.isDirectory()) {
            files = [];
            var filesInFolder = fs.readdirSync(uploadPath);
            files.length = filesInFolder.length;
            for (var i = 0; i < filesInFolder.length; i++) {
                file = filesInFolder[i];
                nameSplit = file.split("_");
                chunkId = nameSplit[0];
                files[chunkId] = file;
            }
        }
    } catch (e) {
        console.log('Sort chunks: ' + e.message);
        console.log('Sort chunks: ' + 'Could not get chunks from partial folder.');
    }
    return files;
};

module.exports = router;
