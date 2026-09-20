/**
 * Regenerates src/modules/pool/domain/cities.generated.json — every populated place
 * the GeoNames-derived `all-the-cities` package (MIT) lists for India and the United
 * States, as compact rows: [name, countryCode, stateName, population].
 *
 *   node scripts/gen-cities.mjs
 *
 * Runtime code never imports `all-the-cities` (a 6 MB dev dependency); only this
 * script does. Re-run when the package is bumped.
 */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const cities = require('all-the-cities')

// GeoNames admin1 codes for India (this dataset still uses the older numeric scheme).
const IN_STATES = {
  '01': 'Andaman and Nicobar Islands', '02': 'Andhra Pradesh', '03': 'Assam', '05': 'Chandigarh',
  '06': 'Dadra and Nagar Haveli', '07': 'Delhi', '09': 'Gujarat', '10': 'Haryana', '11': 'Himachal Pradesh',
  '12': 'Jammu and Kashmir', '13': 'Kerala', '14': 'Lakshadweep', '16': 'Maharashtra', '17': 'Manipur',
  '18': 'Meghalaya', '19': 'Karnataka', '20': 'Nagaland', '21': 'Odisha', '22': 'Puducherry', '23': 'Punjab',
  '24': 'Rajasthan', '25': 'Tamil Nadu', '26': 'Tripura', '28': 'West Bengal', '29': 'Sikkim',
  '30': 'Arunachal Pradesh', '31': 'Mizoram', '32': 'Daman and Diu', '33': 'Goa', '34': 'Bihar',
  '35': 'Madhya Pradesh', '36': 'Uttar Pradesh', '37': 'Chhattisgarh', '38': 'Jharkhand', '39': 'Uttarakhand',
  '40': 'Telangana', '41': 'Ladakh',
}
const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
}

const plain = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim()
const best = new Map() // `${name}|${cc}|${state}` → row; keep the most populous duplicate
for (const c of cities) {
  if (c.country !== 'IN' && c.country !== 'US') continue
  if (c.featureCode === 'PPLQ' || c.featureCode === 'PPLW') continue // abandoned / destroyed
  const state = c.country === 'IN' ? IN_STATES[c.adminCode] ?? '' : US_STATES[c.adminCode] ?? ''
  const name = plain(c.name)
  const key = `${name.toLowerCase()}|${c.country}|${state}`
  const prev = best.get(key)
  if (!prev || prev[3] < c.population) best.set(key, [name, c.country, state, c.population])
}
const rows = [...best.values()].sort((a, b) => b[3] - a[3])
const out = { generated: new Date().toISOString().slice(0, 10), source: 'all-the-cities@3.1.0 (GeoNames, MIT)', rows }
writeFileSync(new URL('../src/modules/pool/domain/cities.generated.json', import.meta.url), JSON.stringify(out).replace(/\],\[/g, '],\n['))
console.log(`wrote ${rows.length} rows (IN ${rows.filter((r) => r[1] === 'IN').length}, US ${rows.filter((r) => r[1] === 'US').length})`)
