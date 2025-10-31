const Joi = require('joi');

// Existing travel plan schema
const travelSchema = Joi.object({
  destination: Joi.string().required(),
  passport: Joi.string().required(),
  start_date: Joi.date().required(),
  end_date: Joi.date().required(),
  budget: Joi.number().required()
});

// Feedback schema
const feedbackSchema = Joi.object({
  message: Joi.string().required().min(1).max(1000) // optional max length
});

// Middleware to validate travel input
const validateTravelInput = (req, res, next) => {
  const { error } = travelSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });
  next();
};

// Middleware to validate feedback input
const validateFeedbackInput = (req, res, next) => {
  const { error } = feedbackSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });
  next();
};

module.exports = { validateTravelInput, validateFeedbackInput };
