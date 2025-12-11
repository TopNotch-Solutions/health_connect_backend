const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/ailments');
    },
    filename: (req, file, cb) => {
        console.log(file)
        cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });
console.log(upload, "hjkjhgfghjkl")
module.exports = {
    uploadAilment: upload.single("image")
};