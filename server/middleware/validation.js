const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        message: 'Validation error',
        details: error.details.map(detail => detail.message),
      });
    }
    next();
  };
};

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
  firstName: Joi.string().min(1).max(50).optional(),
  lastName: Joi.string().min(1).max(50).optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const createGroupSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  maxUsers: Joi.number().integer().min(2).max(50).optional(),
  colorIndex: Joi.number().integer().min(1).max(5).optional(),
});

const updateGroupSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional().allow(''),
  maxUsers: Joi.number().integer().min(2).max(50).optional(),
  colorIndex: Joi.number().integer().min(1).max(5).optional(),
});

const inviteUserSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string().valid('ADMIN', 'MODERATOR', 'MEMBER').optional(),
});

const addAddonSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  manifestUrl: Joi.string().uri().required(),
  description: Joi.string().max(500).optional(),
  iconUrl: Joi.string().uri().optional(),
  version: Joi.string().max(20).optional(),
  author: Joi.string().max(100).optional(),
  category: Joi.string().max(50).optional(),
});

const updateAddonSettingsSchema = Joi.object({
  settings: Joi.object().optional(),
  isEnabled: Joi.boolean().optional(),
});

const updateUserSchema = Joi.object({
  firstName: Joi.string().min(1).max(50).optional(),
  lastName: Joi.string().min(1).max(50).optional(),
  username: Joi.string().alphanum().min(3).max(30).optional(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
});

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  createGroupSchema,
  updateGroupSchema,
  inviteUserSchema,
  addAddonSchema,
  updateAddonSettingsSchema,
  updateUserSchema,
  changePasswordSchema,
};
