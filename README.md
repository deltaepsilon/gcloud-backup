# gcloud-backup
A single-purpose Node.js CLI to backup any local folder to any Google Cloud Storage bucket, regardless of size.

## Installation
```npm install -g gcloud-backup``` or ```npm install gcloud-backup``` if you want to use this programatically.

## Testing
Are you kidding? This is not for mission-critical stuff. It's ~130 lines of JavaScript. And you have to test these things manually anyway... so I'm not complicating this.

## General Usage
The point of ```gbackup``` is to back up one folder at a time to Google Cloud Storage. I'm using it for long-term, cold backup, but you could use it for anything. It also tracks rough upload progress for large file counts.

The biggest issue that this solves is that when you're uploading tons of data over hours and hours, you'll occasionally have connectivity problems, or your machine will go to sleep, and you want to be able to resume the upload process without duplicating your files. ```gbackup``` scans your folder and scans your bucket for matching files. It counts out how many files have been uploaded and how many need to be uploaded and goes to work on the need-to-be-uploaded files. 

Once a file has been uploaded, ```gbackup``` adds an [extended file attribute](https://en.wikipedia.org/wiki/Extended_file_attributes)—-```gbackup-md5Hash```--to each uploaded filesystem. This md5Hash matches the hash of the gzipped file on Google Cloud Storage. So once ```gbackup``` is done uploading new files, it will start overwriting changed files. If you don't want it to do that, remove lines 141 through 144 of ```index.js```. Or don't change files in your backup folder. Whatever you like... I don't care.

```gbackup``` respects folder structure, but won't waste time with absolute paths. For example, if your folder is ```/Users/myUser/video```, and your ```~/video``` folder has a bunch of sub-folders, ```gbackup``` will place each file within it's correct sub-folder, and the sub-folders will all live within ```gs://my-terrible-bucket/video/```.

My idea was to put a single folder of massive video files on into a bucket while maintaining a reasonable folder structure. The code isn't that fancy, so hack it to your needs and let me know how it goes.

## CLI Use
I'm currently backing up a bunch of videos from my desktop to a storage bucket.

***Details:***

- Folder: ```/Users/quiver/Desktop/video```
- Bucket: ```coldline.chrisesplin.com```
- Service Account: ```~/.gcloud/chris-esplin-service-account.json```
- Project Id: ```chrisesplin```

***How the CLI call looks***

```gbackup /Users/quiver/Desktop/video -b coldline.chrisesplin.com -s ~/.gcloud/chris-esplin-service-account.json -p chrisesplin -e SkipThisFolderName```

You have to pass in all of those flags to make it work. Also, you can pass in a storage class like this:
```-s NEARLINE``` or ```-s REGIONAL```

gbackup defaults to ```-s COLDLINE```, which is crazy cheap and appropriate for the family videos that I don't expect to need unless my house burns down or my kids steal and lose my external hard drives.

## Programatic Node.js Use

I haven't tested this at all, but this module does expose a ```start()``` function. It uses ```start()``` internally, so it should work fine as a local module. If not, send me an issue or a pull request and I'll fix it.

Here's how ```start()``` looks.

```javascript
var gbackup = require('gcloud-backup');
var path = '/Users/myUser/Desktop/someFolder';
var bucketName = 'my-terrible-bucket';
var projectId = 'some-project-id-123456';
var serviceAccount = '/Users/myUser/.super-secret-folder/service-account.json';
var excludedRegex = 'MassiveFilesToIgnore';
var metadata = {
  storageClass: 'NEARLINE'
};
gbackup.start(path, bucketName, projectId, serviceAccount, excludedRegex, metadata);
```

The only tricky thing to note here is that the ```metadata``` should only include metadata that you want to set for all files. Most files will set their own metadata just fine, but if you want to get fancy and maybe even serve these files publicly, that's entirely up to you. It's outside of my one-day budget to create this tool, so I'm not testing it unless this thing gets popular and people bug me about it.
