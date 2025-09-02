import Queue from 'bull';
import { BookingService } from '../services/booking.services';
import { Logger } from '../utils/logger';
import { BookingStatus } from '../types/booking';

const logger = new Logger('PaymentQueue');

export const paymentQueue = new Queue('paymentProcessing', {
  redis: {
    port: parseInt(process.env.REDIS_PORT || '6379'),
    host: process.env.REDIS_HOST || 'localhost',
    db: 1,
  },
  settings: {
    retryProcessDelay: 5000,
    maxStalledCount: 3,
    stalledInterval: 30000,
    lockDuration: 60000,
    drainDelay: 5,
    backoffStrategies: {
      exponential: (attemptsMade) => Math.pow(2, attemptsMade) * 1000,
    },
  },
});

// Process payment
paymentQueue.process('processPayment', async (job) => {
  const { bookingId } = job.data;
  const bookingService = new BookingService();

  try {
    const booking = await bookingService.getBooking(bookingId);

    if (!booking || booking.status !== BookingStatus.PENDING) {
      return `Booking ${bookingId} not eligible for payment`;
    }

    const result = await bookingService.confirmBooking(bookingId);
    if (result.success) {
      logger.info(`Confirmation successful for booking ${bookingId}`);
      return `Confirmation processed successfully for booking ${bookingId}`;
    } else {
      logger.error(`Failed to confirm booking ${bookingId}: ${result.message}`);
      throw new Error(`Confirmation failed: ${result.message}`); // Trigger retry
    }
  } catch (error) {
    logger.error(`Confirmation processing error for booking ${bookingId}:`, error);
    throw error; // Bull will handle retries
  }
});

// Cancel unpaid bookings
paymentQueue.process('cancelUnpaidBooking', async (job) => {
  const { bookingId } = job.data;
  const bookingService = new BookingService();

  try {
    const booking = await bookingService.getBooking(bookingId);

    if (!booking) {
      return `Booking ${bookingId} not found`;
    }

    if (booking.status === BookingStatus.PENDING) {
      const result = await bookingService.cancelBooking(
        bookingId,
        'Payment timeout'
      );

      if (result.success) {
        logger.info(`Booking ${bookingId} cancelled due to payment timeout`);
        return `Booking ${bookingId} cancelled - payment timeout`;
      } else {
        logger.error(
          `Failed to cancel booking ${bookingId}: ${result.message}`
        );
        return `Failed to cancel booking ${bookingId}`;
      }
    } else {
      return `Booking ${bookingId} already processed: ${booking.status}`;
    }
  } catch (error) {
    logger.error(
      `Error in timeout cancellation for booking ${bookingId}:`,
      error
    );
    throw error;
  }
});
