import { PrismaClient } from '@prisma/client';
import { prisma } from '../configs/db';
import { DistributedLock } from '../utils/distributedLock';
import { BookingResult, BookingStatus } from '../types/booking';
import { Logger } from '../utils/logger';
import { paymentQueue } from '../queues/payment.queue';
import { FIFTEEN_MINUTES_IN_MS } from '../shared/constants';

const logger = new Logger('BookingService');

export class BookingService {
  private dbClient: PrismaClient;

  constructor(dbClient: PrismaClient = prisma) {
    this.dbClient = dbClient;
  }

  async createBooking(
    userId: number,
    eventId: number,
    ticketQuantity: number
  ): Promise<BookingResult> {
    const lockKey = `booking:event:${eventId}`; // prevent other bookings for same event
    const lock = new DistributedLock(lockKey, 30);

    try {
      return await lock.withLock(async () => {
        // measure time spent in lock
        const startTime = Date.now();
        return await this.dbClient.$transaction(async (tx) => {
          // QUESTION: should async get event info and verify user?
          // lock the event row and get current state
          const event = await tx.event.findUnique({
            where: { id: eventId },
            select: {
              id: true,
              name: true,
              totalTickets: true,
              ticketsSold: true,
              ticketPrice: true,
            },
          });

          if (!event) {
            return { success: false, message: 'Event not found' };
          }

          // check tickets availability
          const availableTickets = event.totalTickets - event.ticketsSold;
          if (availableTickets < ticketQuantity) {
            return {
              success: false,
              message: `Only ${availableTickets} tickets available`,
            };
          }

          // verify user
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true },
          });

          if (!user) {
            return { success: false, message: 'User not found' };
          }

          // create booking with PENDING status
          const totalAmount =
            ticketQuantity * parseFloat(event.ticketPrice.toString());
          const paymentDeadline = new Date(Date.now() + FIFTEEN_MINUTES_IN_MS);

          const booking = await tx.booking.create({
            data: {
              userId,
              eventId,
              ticketQuantity,
              totalAmount,
              status: BookingStatus.PENDING,
              paymentDeadline,
            },
          });

          // encounter: { error "No record was found for an update."} if using below
          // const updateResult = await tx.event.update({
          //   where: { id: eventId, totalTickets: { gte: event.totalTickets + ticketQuantity } },
          //   data: { ticketsSold: { increment: ticketQuantity } },
          // }); // AND condition make sure don't oversell 
          const updateResult = await tx.$executeRaw`
            UPDATE events 
            SET tickets_sold = tickets_sold + ${ticketQuantity}
            WHERE id = ${eventId} 
            AND tickets_sold + ${ticketQuantity} <= total_tickets 
          `; // AND condition make sure don't oversell

          if (updateResult === 0) {
            // not meet condition AND above <=> for some reason tickets sold out meanwhile
            throw new Error('Tickets no longer available');
          }

          //payment timeout check
          await paymentQueue.add(
            'cancelUnpaidBooking',
            { bookingId: booking.id },
            { delay: FIFTEEN_MINUTES_IN_MS } 
          );

          logger.info(`Booking created successfully: ${booking.id}`);
          logger.info(`Acquired lock for event ${eventId} after ${Date.now() - startTime}ms`);
          return {
            success: true,
            message: 'Booking created successfully',
            booking,
          };
        });
      });
    } catch (error) {
      logger.error(`Error creating booking:`, error);

      if (
        error instanceof Error &&
        error.message === 'Tickets no longer available'
      ) {
        return { success: false, message: 'Tickets no longer available' };
      }

      return { success: false, message: 'Internal server error' };
    }
  }

  async confirmBooking(bookingId: number): Promise<BookingResult> {
    try {
      return await this.dbClient.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
        });

        if (!booking) {
          return { success: false, message: 'Booking not found' };
        }

        if (booking.status !== BookingStatus.PENDING) {
          return {
            success: false,
            message: `Booking already ${booking.status}`,
          };
        }

        if (new Date() > booking.paymentDeadline) {
          return { success: false, message: 'Payment deadline exceeded' };
        }

        const updatedBooking = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.CONFIRMED,
            confirmedAt: new Date(),
          },
        });

        logger.info(`Booking confirmed: ${bookingId}`);
        return {
          success: true,
          message: 'Booking confirmed',
          booking: updatedBooking,
        };
      });
    } catch (error) {
      logger.error(`Error confirming booking ${bookingId}:`, error);
      return { success: false, message: 'Failed to confirm booking' };
    }
  }

  // for now, not allow cancel confirmed booking for simplicity
  async cancelBooking(
    bookingId: number,
    reason: string = 'User cancellation'
  ): Promise<BookingResult> {
    try {
      return await this.dbClient.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { event: true },
        });

        if (!booking) {
          return { success: false, message: 'Booking not found' };
        }

        if (booking.status === BookingStatus.CANCELLED) {
          return { success: false, message: 'Booking already cancelled' };
        }

        if (booking.status === BookingStatus.CONFIRMED) {
          return { success: false, message: 'Cannot cancel confirmed booking' };
        }

        // decrease tickets_sold
        await tx.event.update({
          where: { id: booking.eventId },
          data: {
            ticketsSold: {
              decrement: booking.ticketQuantity,
            },
          },
        });

        // Update booking status
        const updatedBooking = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.CANCELLED,
            cancelledAt: new Date(),
          },
        });

        logger.info(`Booking cancelled: ${bookingId}, reason: ${reason}`);
        return {
          success: true,
          message: 'Booking cancelled successfully',
          booking: updatedBooking,
        };
      });
    } catch (error) {
      logger.error(`Error cancelling booking ${bookingId}:`, error);
      return { success: false, message: 'Failed to cancel booking' };
    }
  }

  async getBooking(bookingId: number) {
    return await this.dbClient.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, name: true, dateTime: true } },
      },
    });
  }
}
