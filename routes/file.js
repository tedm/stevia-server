var config = require('../config.json');
var multiparty = require('multiparty');
var rimraf = require('rimraf');
var fs = require('fs');
var exec = require('child_process').exec;

var express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const File = mongoose.model('File');

// middleware that is specific to this router
router.use(function timeLog(req, res, next) {
    console.log('Time: ', Date.now());
    next();
});


router.get('/create', function(req, res) {
    // const user = new User(req.query);
    // console.log(user);
    // console.log(user.save(function(err) {
    //     if (err) {
    //         console.log("error: " + err)
    //     }
    // }));
    res.send('user works!!!!!');
});

router.delete('/delete', function(req, res) {
    // User.findOne({
    //     'email': req.query.email
    // }, function(err, user) {
    //     if (err) return handleError(err);
    //     console.log(user);
    //     user.save();
    //
    //     res.send(user);
    // });
});

router.get('/:fileId/get', function(req, res) {
    // User.findOne({
    //     'email': req.params.email
    // }, function(err, user) {
    //     res.send(user);
    // });
});

/******************************/
/******** Upload file *********/
/******************************/

/******************************/
/******************************/
router.post('/upload', function(req, res, next) {
    var fields = {};
    var stream;
    var form = new multiparty.Form({
        autoFields: true
    });

    // Fields
    form.on('field', function(name, value) {
        // console.log(name + ': ' + value);
        fields[name] = value;
    });

    //Files, should be only one;
    form.on('part', function(part) {
        var path = config.dirname; // TODO get file dir with multipartFields.parentId
        var uploadPath = path + fields.name + "_partial";
        try {
            fs.mkdirSync(uploadPath);
        } catch (e) {
            console.log('Upload: ' + uploadPath + ' ' + 'already created');
        }
        var filepath = uploadPath + '/' + fields.chunk_id + "_" + fields.chunk_size + "_partial";
        var writeStream = fs.createWriteStream(filepath);
        part.pipe(writeStream);
        writeStream.on('finish', function() {
            var stats = fs.statSync(filepath);
            console.log('Chunk ' + fields.chunk_id + ' created. Chunk size: ' + stats.size);

            if (fields.last_chunk === 'true') {
                console.log('Chunk ' + fields.chunk_id + ' is the last');
                var finalFilePath = path + fields.name;
                var files = getSortedChunkList(uploadPath);
                var fd = fs.openSync(finalFilePath, 'w');
                fs.closeSync(fd);
                var fd = fs.openSync(finalFilePath, 'a');
                var c = 0;
                for (var i = 0; i < files.length; i++) {
                    var file = uploadPath + '/' + files[i];
                    var data = fs.readFileSync(file);
                    fs.appendFileSync(fd, data, null);
                }
                fs.closeSync(fd);
                var stats = fs.statSync(finalFilePath);
                console.log('File ' + finalFilePath + ' created. Final size: ' + stats.size);
                rimraf(uploadPath, function() {
                    console.log('Temporal upload folder ' + uploadPath + ' removed');
                    res.send({});
                });
            } else {
                res.send({});
            }
        });
    });

    form.on('close', function() {
        req._multipartFields = fields;
        var path = config.dirname; // TODO get file dir with multipartFields.parentId
        var uploadPath = path + fields.name + "_partial";
        if (fields.resume_upload === 'true') {
            res.setHeader('Content-Type', 'application/json');
            res.send(getResumeFileInfo(uploadPath));
        }
    });
    form.parse(req);
});

/******************************/
/******************************/
function getResumeFileInfo(path) {
    var info = {};
    try {
        fs.accessSync(path);
        var stats = fs.statSync(path);
        if (stats.isDirectory()) {
            var filesInFolder = fs.readdirSync(path);
            for (var i = 0; i < filesInFolder.length; i++) {
                var file = filesInFolder[i];
                var nameSplit = file.split("_");
                info[nameSplit[0]] = {
                    size: nameSplit[1]
                };
            }
        }
    } catch (e) {
        console.log('Resume upload: ' + e.message);
        console.log('Resume upload: ' + 'Nothing to resume');
    }
    return info;
};

function getSortedChunkList(path) {
    var files, chunkId, file, nameSplit;
    try {
        fs.accessSync(path);
        var stats = fs.statSync(path);
        if (stats.isDirectory()) {
            files = [];
            var filesInFolder = fs.readdirSync(path);
            files.length = filesInFolder.length;
            for (var i = 0; i < filesInFolder.length; i++) {
                file = filesInFolder[i];
                nameSplit = file.split("_");
                chunkId = nameSplit[0];
                files[chunkId] = file;
            }
            // for (var i = 0; i < filesInFolder.length; i++) {
            //     var file = filesInFolder[i];
            //     var nameSplit = file.split("_");
            //     info[nameSplit[0]] = {
            //         size: nameSplit[1]
            //     };
            // }
        }
    } catch (e) {
        console.log('Sort chunks: ' + e.message);
        console.log('Sort chunks: ' + 'Could not get chunks from partial folder.');
    }
    return files;
}


module.exports = router;
