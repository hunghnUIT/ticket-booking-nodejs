export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED'
}

export interface CreateBookingRequest {
  userId: number;
  eventId: number;
  ticketQuantity: number;
}

export interface BookingResult {
  success: boolean;
  message: string;
  booking?: any;
}

export interface EventStats {
  eventId: number;
  eventName: string;
  totalTickets: number;
  ticketsSold: number;
  ticketsAvailable: number;
  estimatedRevenue: number;
}
