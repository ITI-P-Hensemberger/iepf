type LessonSeats = {
  availableSeats: number
  dailyCapacity: number
  dailyOccupancy: number
}

// Both the lesson's seats and the tutor's daily capacity limit a booking, and
// occupancy already includes this lesson's bookings: subtracting it from the
// available seats would count them twice.
export function lessonBookableSeats(lesson: LessonSeats) {
  return Math.max(
    0,
    Math.min(lesson.availableSeats, lesson.dailyCapacity - lesson.dailyOccupancy)
  )
}
