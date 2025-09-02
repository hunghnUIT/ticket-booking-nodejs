export type Event = {
  id: number;
  name: string;
  dateTime: Date;
  totalTickets: number;
  ticketPrice: number;
  createdAt: Date;
  updatedAt: Date;
};

export type EventStats = {
  eventId: number;
  eventName: string;
  totalTickets: number;
  ticketsSold: number;
  ticketsAvailable: number;
  estimatedRevenue: number; // Sum of all confirmed bookings' totalAmount
};

export type CreateEventInput = {
  name: string;
  description?: string;
  dateTime: string; // ISO string
  totalTickets: number;
  ticketPrice: number;
};

export type UpdateEventInput = Partial<CreateEventInput>;

export type EventFilter = {
  dateFrom?: string; // ISO string
  dateTo?: string;   // ISO string
  minPrice?: number;
  maxPrice?: number;
  nameContains?: string;
};