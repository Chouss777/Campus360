export function eventDate(event, part = "date", end = false) {
  const key = end ? "dateHeureFin" : "dateHeureDebut";
  const campus = event[`${key}Campus`];
  return new Intl.DateTimeFormat("fr-MA", {
    ...(part === "time"
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "long", year: "numeric" }),
    timeZone: campus ? "UTC" : "Africa/Casablanca",
  }).format(new Date(campus ? `${campus}Z` : event[key]));
}
