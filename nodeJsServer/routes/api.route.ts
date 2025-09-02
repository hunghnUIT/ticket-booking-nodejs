import express, { Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { prisma } from '../configs/db';
import { BookingService } from '../services/booking.services';
import { EventStats } from '../types/booking';
import { Logger } from '../utils/logger';
import {
  createEventService,
  getEventByIdService,
  getEventsService,
} from '../services/event.services';
import { handleValidationErrors } from '../middlewares/validationError'; 

const router = express.Router();
const logger = new Logger('APIRoutes');

router.post(
  '/users',
  [
    body('name').isLength({ min: 1 }).withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { name, email } = req.body;

      const user = await prisma.user.create({
        data: { name, email },
      });

      res.status(201).json(user);
    } catch (error: any) {
      if (error.code === 'P2002') {
        res.status(400).json({ error: 'Email already registered' });
      } else {
        logger.error('Error creating user:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }
);

// Event endpoints
// for now, tickets there will be only one type of ticket and one price per event for simplicity
router.post(
  '/events',
  [
    body('name').isLength({ min: 1 }).withMessage('Event name is required'),
    body('dateTime')
      .isISO8601()
      .withMessage('Valid event date time is required'),
    body('totalTickets')
      .isInt({ min: 1 })
      .withMessage('Total tickets must be a positive integer'),
    body('ticketPrice')
      .isFloat({ min: 0.01 })
      .withMessage('Ticket price must be a positive float'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const event = await createEventService(req.body);

      res.status(201).json(event);
    } catch (error) {
      logger.error('Error creating event:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/events',
  [
    query('skip').optional().isInt({ min: 0 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const skip = parseInt(req.query.skip as string) || 0;
      const limit = parseInt(req.query.limit as string) || 100;

      const events = await getEventsService(skip, limit);
      res.json(events);
    } catch (error) {
      logger.error('Error fetching events:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/events/:id',
  [param('id').isInt().withMessage('Event ID must be a positive integer')],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.id);
      const event = await getEventByIdService(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      res.json(event);
    } catch (error) {
      logger.error('Error fetching event:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/bookings',
  [
    body('userId')
      .isInt({ min: 1 })
      .withMessage('User ID must be a positive integer'),
    body('eventId')
      .isInt({ min: 1 })
      .withMessage('Event ID must be a positive integer'),
    body('ticketQuantity')
      .isInt({ min: 1 })
      .withMessage('Ticket quantity must be a positive integer'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { userId, eventId, ticketQuantity } = req.body;
      const bookingService = new BookingService();

      const result = await bookingService.createBooking(
        userId,
        eventId,
        ticketQuantity
      );

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      res.status(201).json({
        message: result.message,
        bookingId: result.booking.id,
        status: result.booking.status,
        paymentDeadline: result.booking.paymentDeadline,
        totalAmount: result.booking.totalAmount,
      });
    } catch (error) {
      logger.error('Error creating booking:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/bookings/:id',
  [param('id').isInt().withMessage('Booking ID must be a positive integer')],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const bookingId = parseInt(req.params.id);
      const bookingService = new BookingService();

      const booking = await bookingService.getBooking(bookingId);

      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      res.json(booking);
    } catch (error) {
      logger.error('Error fetching booking:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/bookings/:id/cancel',
  [param('id').isInt().withMessage('Booking ID must be a positive integer')],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const bookingId = parseInt(req.params.id);
      const bookingService = new BookingService();

      const result = await bookingService.cancelBooking(bookingId);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      res.json({ message: result.message });
    } catch (error) {
      logger.error('Error cancelling booking:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/events/:id/stats',
  [param('id').isInt().withMessage('Event ID must be a positive integer')],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.id);

      const event = await prisma.event.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      // Calculate confirmed bookings revenue
      const confirmedRevenue = await prisma.booking.aggregate({
        where: {
          eventId,
          status: 'CONFIRMED',
        },
        _sum: {
          totalAmount: true, // sum up the totalAmount of confirmed bookings, totalAmount = ticketQuantity * ticketPrice calculated at booking time
        },
      });

      const stats: EventStats = {
        eventId: event.id,
        eventName: event.name,
        totalTickets: event.totalTickets,
        ticketsSold: event.ticketsSold,
        ticketsAvailable: event.totalTickets - event.ticketsSold,
        estimatedRevenue: parseFloat(
          confirmedRevenue._sum.totalAmount?.toString() || '0'
        ),
      };

      res.json(stats);
    } catch (error) {
      logger.error('Error fetching event statistics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
