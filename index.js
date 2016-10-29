const program = require('commander');
const chalk = require('chalk');
const fs = require('fs');
const xattr = require('fs-xattr');
const xattribute = 'gbackup-md5Hash';
const ProgressBar = require('progress');

function getMd5Hash(path) {
  return !~xattr.listSync(path).indexOf(xattribute) ? undefined : xattr.getSync(path, xattribute).toString();
}

function setMd5Hash(path, md5Hash) {
  return xattr.setSync(path, xattribute, md5Hash);
}

function getFiles(target, prefix = '', topLevelPrefixRegExp) {
  var localPath = `${prefix}/${target}`.replace(/\/\//g, '/');
  var stat = fs.statSync(localPath);

  if (stat.isFile()) return [{ localPath: localPath, remotePath: localPath.replace(topLevelPrefixRegExp, ''), stat: stat, md5Hash: getMd5Hash(localPath) }];
  if (target == '.DS_Store') return result;
  return fs.readdirSync(localPath)
    .filter(item => item !== '.DS_Store')
    .reduce((files, item) => files.concat(getFiles(item, localPath, topLevelPrefixRegExp)), []);
};

function upload(filesToUpload, bucket, metadata, counter = 0) {
  if (!filesToUpload.length) return 'Uploads complete';
  var files = filesToUpload.slice(0);
  var file = files.pop();

  return new Promise(function (resolve, reject) {
    var remoteFile = bucket.file(file.remotePath || file.name);
    var readStream = fs.createReadStream(file.localPath);
    var filename = (file.remotePath || file.name).replace(/.+\//, '');
    var mb =Math.round(file.stat.size/100000)/10;
    var bar = new ProgressBar(` ${filename} (${mb}mb) [:bar] :percent :etas`, {
      width: 20,
      total: file.stat.size,
      clear: true
    });

    readStream.on('data', function(chunk) {
      bar.tick(chunk.length);
    });
    
    readStream
      .pipe(remoteFile.createWriteStream({ gzip: true, metadata: metadata }))
      .on('error', err => reject(err))
      .on('finish', res => resolve(remoteFile));
  })
    .then(function(remoteFile) {
      return new Promise(function(resolve, reject) {
        remoteFile.getMetadata((err, metadata) => resolve(setMd5Hash(file.localPath, metadata.md5Hash)));
      });
    })
    .then(function () {
      console.log(chalk.green(`${++counter} uploaded, ${files.length} remaining`));
      return upload(files, bucket, metadata, counter);
    });
};


program.arguments('<folder>')
  .option('-b, --bucket <bucket>', 'The Google Cloud Storage bucket to receive the backup')
  .option('-p, --projectId <projectId>', 'The Google Cloud project Id.')
  .option('-s, --service-account <serviceAccount>', 'A service account JSON file for the referenced bucket')
  .option('-c, --storage-class <storageClass>', 'Storage class: NEARLINE, COLDLINE, etc.')
  .action(function (folder) {
    if (!folder) return console.log(chalk.red('<folder> missing'));
    if (!program.bucket) return console.log(chalk.red('<bucket> missing. See $: gbackup --help'));
    if (!program.projectId) return console.log(chalk.red('<projectId> missing. See $: gbackup --help'));
    if (!program.serviceAccount) return console.log(chalk.red('<serviceAccount> missing. See $: gbackup --help'));

    var metadata = { storageClass: program.storageClass || 'COLDLINE' };
    start(folder, program.bucket, program.projectId, program.serviceAccount, metadata)
      .then(function (res) {
        console.log(chalk.green(res));
        process.exit();
      })
  })
  .parse(process.argv);

function start(path, bucketName, projectId, keyFilename, metadata) {
  console.log(chalk.green(`Backing up ${path} to ${bucketName}`));
  var gcs = require('@google-cloud/storage')({
    projectId: projectId,
    keyFilename: keyFilename
  });
  var bucket = gcs.bucket(bucketName);
  var pathParts = path.match(/[^\/]+/g);
  var foldername = pathParts.pop();
  var topLevelPrefix = path.replace(new RegExp(foldername + '/?'), '');
  var localFiles = getFiles(path, '', new RegExp(topLevelPrefix));

  return new Promise(function (resolve, reject) {
    bucket.getFiles((err, files) => err ? reject(err) : resolve(files));
  })
    .then(function (remoteFiles) {
      var filesToUpload = localFiles.filter(localFile => !remoteFiles.find(remoteFile => remoteFile.name == localFile.remotePath));
      var filesUploaded = localFiles.filter(file => !!remoteFiles.find(remoteFile => remoteFile.name == file.remotePath));
      var filesChanged = filesUploaded.filter(file => remoteFiles.find(remoteFile => remoteFile.name == file.remotePath).metadata.md5Hash !== getMd5Hash(file.localPath));

      filesUploaded.filter(file => !getMd5Hash(file.localPath))
        .map(function (file) {
          console.log(chalk.yellow(`Updating missing md5Hash for ${file.localPath}`));
          return {
            localPath: file.localPath,
            md5Hash: remoteFiles.find(remoteFile => remoteFile.name == file.remotePath).metadata.md5Hash
          };
        }).forEach(file => setMd5Hash(file.localPath, file.md5Hash));

      console.log(chalk.green(`Files to upload: ${filesToUpload.length}`));
      console.log(chalk.green(`Files uploaded: ${filesUploaded.length}`));
      console.log(chalk.yellow(`Files changed: ${filesChanged.length}`));

      console.log(chalk.green('Beginning uploads...'));
      
      return upload(filesToUpload, bucket, metadata)
        .then(function() {
          console.log(chalk.green('Uploading changed files...'));
          return upload(filesChanged, bucket, metadata);
        });
    });
}

module.exports = {
  start: start
};
