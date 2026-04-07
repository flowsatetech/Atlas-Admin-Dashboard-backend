/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const { body } = require('express-validator');

// <-- LOCAL EXPORTS IMPORTS -->


const signupValidation = [
    body('firstName').isString().trim().isLength({ min: 1 }).withMessage('First Name must be at least 1 character'),
    body('lastName').isString().trim().isLength({ min: 1 }).withMessage('Last Name must be at least 1 character'),
    body('email').isEmail().trim().toLowerCase().withMessage('Invalid email address'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number')
];

const signinValidation = [
    body('email').isEmail().trim().toLowerCase().withMessage('Invalid email address'),
    body('password').notEmpty().withMessage('Password is required')
];

module.exports = { signinValidation, signupValidation }