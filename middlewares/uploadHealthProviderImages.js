const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

module.exports = {
    uploadMultipleDocuments: upload.fields([
        { name: 'profileImage', maxCount: 1 },
        { name: 'idDocumentFront', maxCount: 1 },
        { name: 'idDocumentBack', maxCount: 1 },
        { name: 'primaryQualification', maxCount: 1 },
        { name: 'annualQualification', maxCount: 1 },
        { name: 'primaryQualification', maxCount: 1 },
    ])
};