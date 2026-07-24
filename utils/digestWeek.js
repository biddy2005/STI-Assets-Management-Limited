const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const DAY_LABELS = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday'
};

// Returns the Monday 00:00:00.000 -> Friday 23:59:59.999 boundary
// for the current active calendar week, based on server local time.
function getActiveWeekRange(referenceDate = new Date()) {
  const currentDay = referenceDate.getDay(); // 0 = Sun ... 6 = Sat
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

  const weekStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() + diffToMonday,
    0, 0, 0, 0
  );

  const weekEnd = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 4,
    23, 59, 59, 999
  );

  return { weekStart, weekEnd };
}

// Formats a date as "13th July 2026"
function getOrdinalDate(date) {
  const d = date.getDate();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const m = months[date.getMonth()];
  const y = date.getFullYear();

  let suffix = "th";
  if (d === 1 || d === 21 || d === 31) suffix = "st";
  else if (d === 2 || d === 22) suffix = "nd";
  else if (d === 3 || d === 23) suffix = "rd";

  return `${d}${suffix} ${m} ${y}`;
}

// Given the Monday of a week and a DayOfWeek enum value, returns that day's actual Date.
function getDateForDay(weekStart, dayOfWeek) {
  const index = DAY_ORDER.indexOf(dayOfWeek);
  return new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + index
  );
}

// Transforms flat digest records into a predictable Monday-Friday
// structure, with each day's real calendar date pre-formatted.
function buildWeekMap(digests, weekStart) {
  const byDay = {};
  DAY_ORDER.forEach((day) => { byDay[day] = null; });

  digests.forEach((digest) => {
    if (DAY_ORDER.includes(digest.dayOfWeek)) {
      byDay[digest.dayOfWeek] = digest;
    }
  });

  return DAY_ORDER.map((day) => {
    const dayDate = getDateForDay(weekStart, day);
    return {
      key: day,
      label: DAY_LABELS[day],
      digest: byDay[day],
      formattedDate: getOrdinalDate(dayDate)
    };
  });
}

module.exports = {
  DAY_ORDER,
  DAY_LABELS,
  getActiveWeekRange,
  getOrdinalDate,
  getDateForDay,
  buildWeekMap
};