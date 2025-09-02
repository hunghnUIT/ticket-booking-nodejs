import { BookingService } from '../booking.services';
import { BookingStatus } from '../../types/booking';

// Mock Prisma for testing
const mockPrisma = {
  $transaction: jest.fn(),
  $executeRaw: jest.fn(),
  user: {
    findUnique: jest.fn(),
  },
  event: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  booking: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
} as any;

// Mock payment queue
jest.mock('../../queues/payment.queue', () => ({
  paymentQueue: {
    add: jest.fn(),
  },
}));

describe('BookingService', () => {
  let bookingService: BookingService;

  beforeEach(() => {
    bookingService = new BookingService(mockPrisma);
    jest.clearAllMocks();
  });

  describe('createBooking', () => {
    it('should create a booking successfully', async () => {
      const mockEvent = {
        id: 1,
        name: 'Test Concert',
        totalTickets: 100,
        ticketsSold: 0,
        ticketPrice: 50.00,
      };

      const mockUser = { id: 1 };
      const mockBooking = {
        id: 1,
        userId: 1,
        eventId: 1,
        ticketQuantity: 5,
        totalAmount: 250,
        status: BookingStatus.PENDING,
        paymentDeadline: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          event: {
            findUnique: jest.fn().mockResolvedValue(mockEvent),
          },
          user: {
            findUnique: jest.fn().mockResolvedValue(mockUser),
          },
          booking: {
            create: jest.fn().mockResolvedValue(mockBooking),
          },
          $executeRaw: jest.fn().mockResolvedValue(1),
        });
      });

      const result = await bookingService.createBooking(1, 1, 5);

      expect(result.success).toBe(true);
      expect(result.booking).toEqual(mockBooking);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should prevent overbooking', async () => {
      const mockEvent = {
        id: 1,
        name: 'Test Concert',
        totalTickets: 100,
        ticketsSold: 95,
        ticketPrice: 50.00,
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          event: {
            findUnique: jest.fn().mockResolvedValue(mockEvent),
          },
        });
      });

      const result = await bookingService.createBooking(1, 1, 10);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Only 5 tickets available');
    });

    it('should handle concurrent booking attempts', async () => {
      const mockEvent = {
        id: 1,
        name: 'Test Concert',
        totalTickets: 100,
        ticketsSold: 90,
        ticketPrice: 50.00,
      };

      const mockUser = { id: 1 };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          event: {
            findUnique: jest.fn().mockResolvedValue(mockEvent),
          },
          user: {
            findUnique: jest.fn().mockResolvedValue(mockUser),
          },
          booking: {
            create: jest.fn().mockResolvedValue({
              id: 1,
              userId: 1,
              eventId: 1,
              ticketQuantity: 15,
              totalAmount: 750,
              status: BookingStatus.PENDING,
            }),
          },
          $executeRaw: jest.fn().mockResolvedValue(0), // Simulate concurrent update conflict
        });
      });

      const result = await bookingService.createBooking(1, 1, 15);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Only 10 tickets available');
    });
  });

  describe('confirmBooking', () => {
    it('should confirm a pending booking', async () => {
      const mockBooking = {
        id: 1,
        status: BookingStatus.PENDING,
        paymentDeadline: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      };

      const mockUpdatedBooking = {
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
        confirmedAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          booking: {
            findUnique: jest.fn().mockResolvedValue(mockBooking),
            update: jest.fn().mockResolvedValue(mockUpdatedBooking),
          },
        });
      });

      const result = await bookingService.confirmBooking(1);

      expect(result.success).toBe(true);
      expect(result.booking.status).toBe(BookingStatus.CONFIRMED);
    });

    it('should reject confirmation after deadline', async () => {
      const mockBooking = {
        id: 1,
        status: BookingStatus.PENDING,
        paymentDeadline: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          booking: {
            findUnique: jest.fn().mockResolvedValue(mockBooking),
          },
        });
      });

      const result = await bookingService.confirmBooking(1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Payment deadline exceeded');
    });
  });

  describe('cancelBooking', () => {
    it('should cancel a pending booking and release tickets', async () => {
      const mockBooking = {
        id: 1,
        status: BookingStatus.PENDING,
        eventId: 1,
        ticketQuantity: 5,
        event: { id: 1, ticketsSold: 10 },
      };

      const mockUpdatedBooking = {
        ...mockBooking,
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          booking: {
            findUnique: jest.fn().mockResolvedValue(mockBooking),
            update: jest.fn().mockResolvedValue(mockUpdatedBooking),
          },
          event: {
            update: jest.fn().mockResolvedValue({}),
          },
        });
      });

      const result = await bookingService.cancelBooking(1);

      expect(result.success).toBe(true);
      expect(result.booking.status).toBe(BookingStatus.CANCELLED);
    });

    it('should not cancel confirmed bookings', async () => {
      const mockBooking = {
        id: 1,
        status: BookingStatus.CONFIRMED,
        eventId: 1,
        ticketQuantity: 5,
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          booking: {
            findUnique: jest.fn().mockResolvedValue(mockBooking),
          },
        });
      });

      const result = await bookingService.cancelBooking(1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot cancel confirmed booking');
    });
  });
});
