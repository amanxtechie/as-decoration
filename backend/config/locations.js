/**
 * config/locations.js
 * Single source of truth for the service geography.
 * Districts served by AS Decoration (Bihar, India).
 */
export const DISTRICTS = [
  {
    id: "nalanda",
    name: "Nalanda",
    towns: ["Bihar Sharif", "Rajgir", "Pawapuri", "Nalanda", "Hilsa", "Ekangarsarai"],
  },
  {
    id: "sheikhpura",
    name: "Sheikhpura",
    towns: ["Sheikhpura", "Barbigha", "Mokama", "Ghato"],
  },
  {
    id: "nawada",
    name: "Nawada",
    towns: ["Nawada", "Rajauli", "Pakribarawan", "Kashichak"],
  },
  {
    id: "lakhisarai",
    name: "Lakhisarai",
    towns: ["Lakhisarai", "Barahiya", "Haveli Kharagpur"],
  },
];

export function findDistrict(id) {
  return DISTRICTS.find((d) => d.id === id || d.name.toLowerCase() === String(id).toLowerCase());
}

export default DISTRICTS;
