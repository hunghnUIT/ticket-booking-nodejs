# Event Ticket-Booking System – README

## 1. Features

- Create / update / delete events and users

- Atomic, transaction-safe ticket bookings with per-event distributed locking

- Asynchronous payment simulation (Bull queue) with 15-minute timeout auto-cancellation

- Accurate per-event statistics (tickets sold, revenue)

## 2. Tech Stack

- Runtime: Node.js
- Language: TypeScript
- REST API Web framework: Express.js
- ORM/migrations: Prisma
- Database: PostgreSQL
- Queue/cache Redis + Bull Library (Payment jobs & distributed lock)
- Unit test: Jest

## 3. Local Setup

### 3.1. Prerequisites

- Node.js (ver ≥ 18) includes npm
- PostgreSQL 14
- Redis 7

### 3.2. Clone & install

```bash
git clone https://github.com/hunghnUIT/ticket-booking-nodejs.git
cd ticket-booking-nodejs
npm install
```

### 3.3. Configure environment

```bash
cp .env.example .env
# .env defaults work with the above compose file. Tweak only if you run external DBs.
```

```text
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/quantix_test"
REDIS_HOST="localhost"
REDIS_PORT="6379"
```

### 3.4. Generate DB schema & Prisma client

```bash
# Create DB and run first migration
npx prisma migrate dev --name init

# Regenerate client (also happens automatically on migrate dev)
npx prisma generate
```

### 3.5. Seed sample data (optional)

```bash
npm run seed         # inserts demo users + events
```

### 3.6. Start the API & workers

```bash
# HTTP API (port 8080)
npm run dev          # tsx watch index.ts
```

Open http://localhost:8080/health → { "status": "OK" }.

## 4. Useful Scripts

```bash
npm run dev     #Live-reload API server
npm run test	#Jest unit tests
```

## 5. APIs
<table>
<tr>
<td> Method </td> <td>	Endpoint </td>	<td> Purpose </td> <td> Payload </td>
<td>/api/users</td>
<td>Create user</td>
<td>

```json
{
  "name": "Hung2",
  "email": "hung2@gmail.com"
}
```
</td>

</tr>
<td> POST </td>
<td>/api/events</td>
<td>Create events</td>
<td>

```json
{
  "name": "Avicii Concert",
  "dateTime": "2025-12-21T19:30:00",
  "totalTickets": 200,
  "ticketPrice": 49.95
}
```
</td>

</tr>
<td> GET </td>
<td>/api/events</td>
<td>List events</td>
<td></td>

</tr>
<td> GET </td>
<td>/api/events/:id</td>
<td>Get event</td>
<td></td>

</tr>
<td> POST </td>
<td>/api/bookings</td>
<td>Create bookings</td>
<td>

```json
{
    "userId": 1,
    "eventId": 1,
    "ticketQuantity": 1
}
```

</tr>
<td> POST </td>
<td>/api/bookings/:id/cancel</td>
<td>Cancel bookings</td>
<td></td>

</tr>
<td> GET </td>
<td>/api/bookings/:id</td>
<td>Get bookings</td>
<td></td>

</tr>
<td> GET </td>
<td>/api/events/:id/stats</td>
<td>View statistic for an event</td>
<td></td>

</table>


## 6. Queues

App use _Bull_ library for queueing any successful payment or timed out payment

Bull stores every queue in Redis keys that start with `bull:<queueName>:`.

Connect to the correct Redis database and select DB indexed 1 to view the data inside Bull DB:

```bash
redis-cli # connect redis or "docker exec -it redis redis-cli" if start redis inside Docker
SELECT 1 # use Bull DB

# view delayed jobs and it delay value
ZRANGE bull:paymentProcessing:delayed 0 -1 WITHSCORES

# inspect payload of job id 3
HGETALL bull:paymentProcessing:3
```

Cheat sheet created keys and their types for the **paymentProcessing** queue (the queue's name that is being used for payment handling)

| Key                              | Type | Meaning                               |
| -------------------------------- | ---- | ------------------------------------- |
| `bull:paymentProcessing:wait`    | List | Job IDs ready to run                  |
| `bull:paymentProcessing:active`  | List | Jobs a worker is processing right now |
| `bull:paymentProcessing:delayed` | ZSET | Jobs scheduled for the future         |
| `bull:paymentProcessing:failed`  | List | Jobs that exhausted all attempts      |
| `bull:paymentProcessing:<id>`    | Hash | Payload & metadata for one job        |

##### Example commands:

```bash
# How many jobs are waiting?
LLEN bull:paymentProcessing:wait

# Peek at first 10 waiting job IDs
LRANGE bull:paymentProcessing:wait 0 9

# List all delayed jobs with run-at timestamps
ZRANGE bull:paymentProcessing:delayed 0 -1 WITHSCORES

# Count failed jobs
LLEN bull:paymentProcessing:failed

# Inspect one job’s payload (replace 42 with Job ID)
HGETALL bull:paymentProcessing:42
```
