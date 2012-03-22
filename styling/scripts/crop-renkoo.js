/*
 * The renkoo theme (http://www.adiumxtras.com/index.php?a=xtras&xtra_id=2160)
 *  is nice but pre-dates CSS' border-image and so uses really wide images
 *  which are no longer required.  This script slices and dices those images
 *  down to size for use in border-image.  This is getting checked in because
 *  we might want to alter the image composition slightly and I don't want to
 *  have to re-write the script.
 *
 * Note that the PSD sources for renkoo are available from:
 *  http://itorrey.com/portfolio/renkoo-chat-theme/
 * but that gimp does not understand a lot of what's in the file.
 *
 * To run this script, first "npm install gm", then run the script like so:
 *
 *     node crop-renkoo.js <RENKOO THEME DIR> <OUTPUT DIR>
 */

var $fs = require('fs'), $path = require('path'),
    $gm = require('gm');

var IMAGES_RELPATH = 'renkoo.AdiumMessageStyle/Contents/Resources/images';

var COLORS = ['blue', 'green', 'red', 'steel', 'yellow'];

/**
 * Curve images are 3007 x 30 with 1 pixel of top padding, 0 pixels of right
 *  padding, 3 pixels of bottom padding, 1+ (there is a second pixel with low
 *  alpha) pixels of left padding.
 */
function fixCurvesImage(srcPath, destPath) {
  $gm(srcPath).chop(2887, 10, 10, 10).write(destPath, function(err) {});
}

function copyFile(srcFilePath, destFilePath) {
  var contents = $fs.readFileSync(srcFilePath);
  $fs.writeFileSync(destFilePath, contents);
}

function go(sourcePath, destPath) {
  if (!$path.existsSync(sourcePath))
    throw new Error("Source directory does not exist! " + sourcePath);

  var imagesPath = $path.join(sourcePath, IMAGES_RELPATH);
  if (!$path.existsSync($path.join(imagesPath, 'alert.png')))
    throw new Error("There is no alert.png in " + imagesPath);

  if (!$path.existsSync(destPath))
    throw new Error("Destination path does not exist and we don't want to " +
                    "create it to avoid screwups: " + destPath);

  var curveName, leftName, rightName;
  function goCopy(filename) {
    var dest = $path.join(destPath, filename);
    copyFile($path.join(imagesPath, filename),
             dest);
    return dest;
  }

  COLORS.forEach(function(color) {
    curveName = color + 'Curves.png',
    leftName = color + 'Indicator.png',
    rightName = color + 'Indicator2.png';

    // verbatim copies
    goCopy(leftName);
    goCopy(rightName);
    // transform on the way
    fixCurvesImage($path.join(imagesPath, curveName),
                   $path.join(destPath, curveName));
  });
}

if (process.argv.length !== 4) {
  console.error("we need 2 arguments: renkoo source dir, output dir for images");
  process.exit(1);
}
go(process.argv[2], process.argv[3]);
