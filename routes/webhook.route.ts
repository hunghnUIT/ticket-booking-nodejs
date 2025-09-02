import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import { Logger } from '../utils/logger';

import { paymentQueue } from '../queues/payment.queue';
import { handleValidationErrors } from '../middlewares/validationError'; 

const router = express.Router();
const logger = new Logger('WebhookRoutes');

// TODO: use some signature validation middleware here, make sure it's from trusted source
router.post(
  '/payment-completed',
  [
    body('bookingId').isInt({ min: 1 }).withMessage('Booking ID must be a positive integer greater than 0'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    logger.info('Received payment completion webhook:', req.body);


    const bookingId = req.body.bookingId;
    await paymentQueue.add('processPayment', {
      bookingId: bookingId,
    });
    res.status(200).json({ message: 'Acknowledged' });
  }
);

export default router;