import { prisma } from '../configs/db';
import { Event } from '../types/event';

export const createEventService = async (payload: {
  name: string;
  description: string;
  dateTime: Date;
  totalTickets: number;
  ticketPrice: number;
}): Promise<Event> => {
  const { name, description, dateTime, totalTickets, ticketPrice } = payload;

  const event = await prisma.event.create({
    data: {
      name,
      description,
      dateTime: new Date(dateTime),
      totalTickets,
      ticketPrice,
    },
  });

  return event;
};

export const getEventsService = async (skip: number = 0, limit: number = 100) => {
  const events = await prisma.event.findMany({
    skip,
    take: limit,
    orderBy: { dateTime: 'desc' },
  });

  return events;
};

export const getEventByIdService = async (eventId: number) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  return event;
};

// export const getEventStatsService = async (eventId: number): Promise<EventStats | null> => {
//   const event = await prisma.event.findUnique({
//     where: { id: eventId },
//     select: {
//       id: true,
//       name: true,
//       totalTickets: true,
//       ticketsSold: true,
//       ticketPrice: true,
//       bookings: {
//         where: { status: 'CONFIRMED' },
//         select: {
//           ticketQuantity: true,
//         },
//       },
//     },
//   });

//   if (!event) {
//     return null;
//   }

//   const totalRevenue = event.bookings.reduce((sum, booking) => {
//     return sum + booking.ticketQuantity * parseFloat(event.ticketPrice.toString());
//   }, 0);

//   return {
//     eventId: event.id,
//     eventName: event.name,
//     totalTickets: event.totalTickets,
//     ticketsSold: event.ticketsSold,
//     ticketsAvailable: event.totalTickets - event.ticketsSold,
//     estimatedRevenue: totalRevenue,
//   };
// };