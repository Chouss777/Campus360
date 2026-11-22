import { Icon } from "./Icons.jsx";

// Club identity comes from the API; no hardcoded or invented club logos.
export function ClubAvatar({ club, size = 29 }) {
  return club.logoUrl ? (
    <img src={club.logoUrl} alt="" />
  ) : <Icon name="users" size={size} />;
}
