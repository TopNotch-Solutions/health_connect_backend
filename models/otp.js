const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    cellphoneNumber: {
        type: String,
        required: true},
    otp: {
        type: String,
        required: true
    },
    createdAt: { 
        type: Date,
        required: true,
    },
    expireAt: { 
        type: Date,
        required: true,
    },    
},{
    timestamps: false,
})
otpSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
const OTP = mongoose.model('OTP', otpSchema);
module.exports = OTP;