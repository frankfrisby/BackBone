# Calendar & Scheduling Skill

Manage calendar events and scheduling programmatically.

## Dependencies
```bash
npm install googleapis ical-generator luxon
```

## Google Calendar Integration

```javascript
import { google } from 'googleapis';

// Setup Google Calendar client
function getCalendarClient(credentials, token) {
  const auth = new google.auth.OAuth2(
    credentials.clientId,
    credentials.clientSecret,
    credentials.redirectUri
  );
  auth.setCredentials(token);
  return google.calendar({ version: 'v3', auth });
}

// List events
async function listEvents(calendar, calendarId = 'primary', options = {}) {
  const response = await calendar.events.list({
    calendarId,
    timeMin: options.startDate || new Date().toISOString(),
    timeMax: options.endDate,
    maxResults: options.maxResults || 10,
    singleEvents: true,
    orderBy: 'startTime'
  });
  return response.data.items;
}

// Create event
async function createEvent(calendar, calendarId = 'primary', event) {
  const response = await calendar.events.insert({
    calendarId,
    resource: {
      summary: event.title,
      description: event.description,
      start: { dateTime: event.startTime, timeZone: event.timeZone || 'UTC' },
      end: { dateTime: event.endTime, timeZone: event.timeZone || 'UTC' },
      attendees: event.attendees?.map(email => ({ email })),
      reminders: {
        useDefault: false,
        overrides: event.reminders || [{ method: 'email', minutes: 30 }]
      }
    }
  });
  return response.data;
}

// Update event
async function updateEvent(calendar, calendarId = 'primary', eventId, updates) {
  const response = await calendar.events.patch({
    calendarId,
    eventId,
    resource: updates
  });
  return response.data;
}

// Delete event
async function deleteEvent(calendar, calendarId = 'primary', eventId) {
  await calendar.events.delete({ calendarId, eventId });
  return true;
}
```

## Find Free Time Slots

```javascript
import { DateTime } from 'luxon';

async function findFreeSlots(calendar, calendarId, date, durationMinutes = 60) {
  const startOfDay = DateTime.fromISO(date).startOf('day');
  const endOfDay = startOfDay.endOf('day');

  const events = await listEvents(calendar, calendarId, {
    startDate: startOfDay.toISO(),
    endDate: endOfDay.toISO(),
    maxResults: 50
  });

  // Define working hours
  const workStart = startOfDay.set({ hour: 9 });
  const workEnd = startOfDay.set({ hour: 17 });

  // Find busy times
  const busyTimes = events.map(e => ({
    start: DateTime.fromISO(e.start.dateTime || e.start.date),
    end: DateTime.fromISO(e.end.dateTime || e.end.date)
  })).sort((a, b) => a.start - b.start);

  // Find free slots
  const freeSlots = [];
  let currentTime = workStart;

  for (const busy of busyTimes) {
    if (currentTime < busy.start) {
      const gap = busy.start.diff(currentTime, 'minutes').minutes;
      if (gap >= durationMinutes) {
        freeSlots.push({ start: currentTime.toISO(), end: busy.start.toISO(), duration: gap });
      }
    }
    currentTime = busy.end > currentTime ? busy.end : currentTime;
  }

  if (currentTime < workEnd) {
    const gap = workEnd.diff(currentTime, 'minutes').minutes;
    if (gap >= durationMinutes) {
      freeSlots.push({ start: currentTime.toISO(), end: workEnd.toISO(), duration: gap });
    }
  }

  return freeSlots;
}
```

## Generate ICS File

```javascript
import icalGenerator from 'ical-generator';
import fs from 'fs';

function createICSFile(events, filename) {
  const calendar = icalGenerator({ name: 'My Calendar' });

  events.forEach(event => {
    calendar.createEvent({
      start: new Date(event.startTime),
      end: new Date(event.endTime),
      summary: event.title,
      description: event.description,
      location: event.location,
      url: event.url,
      organizer: event.organizer ? { name: event.organizer.name, email: event.organizer.email } : undefined
    });
  });

  fs.writeFileSync(filename, calendar.toString());
  return filename;
}

function createRecurringEvent(calendar, event, recurrence) {
  calendar.createEvent({
    start: new Date(event.startTime),
    end: new Date(event.endTime),
    summary: event.title,
    repeating: {
      freq: recurrence.frequency, // 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'
      count: recurrence.count,
      interval: recurrence.interval || 1,
      byDay: recurrence.byDay // ['MO', 'WE', 'FR']
    }
  });
}
```

## Meeting Scheduler

```javascript
class MeetingScheduler {
  constructor(calendar, calendarId = 'primary') {
    this.calendar = calendar;
    this.calendarId = calendarId;
  }

  async scheduleMeeting(meeting) {
    // Find available slot
    const freeSlots = await findFreeSlots(
      this.calendar,
      this.calendarId,
      meeting.preferredDate,
      meeting.duration
    );

    if (freeSlots.length === 0) {
      throw new Error('No available slots for the requested date');
    }

    // Use first available slot or preferred time
    const slot = meeting.preferredTime
      ? freeSlots.find(s => DateTime.fromISO(s.start).hour === meeting.preferredTime.hour)
      : freeSlots[0];

    if (!slot) {
      throw new Error('Preferred time is not available');
    }

    // Create the meeting
    const startTime = DateTime.fromISO(slot.start);
    const endTime = startTime.plus({ minutes: meeting.duration });

    return await createEvent(this.calendar, this.calendarId, {
      title: meeting.title,
      description: meeting.description,
      startTime: startTime.toISO(),
      endTime: endTime.toISO(),
      attendees: meeting.attendees,
      timeZone: meeting.timeZone
    });
  }

  async reschedule(eventId, newDate) {
    const freeSlots = await findFreeSlots(this.calendar, this.calendarId, newDate, 60);

    if (freeSlots.length === 0) {
      throw new Error('No available slots for the new date');
    }

    return await updateEvent(this.calendar, this.calendarId, eventId, {
      start: { dateTime: freeSlots[0].start },
      end: { dateTime: DateTime.fromISO(freeSlots[0].start).plus({ hours: 1 }).toISO() }
    });
  }
}
```

## Usage Examples

```javascript
// Setup
const calendar = getCalendarClient(credentials, token);

// List upcoming events
const events = await listEvents(calendar, 'primary', {
  maxResults: 20
});

// Create a meeting
await createEvent(calendar, 'primary', {
  title: 'Team Standup',
  description: 'Daily standup meeting',
  startTime: '2024-01-15T09:00:00',
  endTime: '2024-01-15T09:30:00',
  timeZone: 'America/New_York',
  attendees: ['team@company.com']
});

// Find free time
const freeSlots = await findFreeSlots(calendar, 'primary', '2024-01-15', 60);
console.log('Available 1-hour slots:', freeSlots);

// Generate ICS file
createICSFile([
  { title: 'Conference', startTime: '2024-02-01T10:00:00', endTime: '2024-02-01T12:00:00' }
], 'conference.ics');

// Use meeting scheduler
const scheduler = new MeetingScheduler(calendar);
await scheduler.scheduleMeeting({
  title: 'Project Review',
  duration: 60,
  preferredDate: '2024-01-20',
  attendees: ['manager@company.com']
});
```
