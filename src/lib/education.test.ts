import { describe, it, expect } from 'vitest'
import { tidyEducation } from './education'

// Farheen Neyaz, exactly as Crustdata returned it (2026-10-03).
const FARHEEN = [
  { year: 2021, field: null, degree: 'Bachelor of Architecture', school: 'Birla Institute of Technology, Mesra' },
  { year: 2016, field: null, degree: 'CBSE', school: 'D.A.V. Public School, Bistupur, Jamshedpur' },
  { year: 2023, field: null, degree: 'Master of Business Administration - MBA', school: 'XLRI Jamshedpur' },
  { year: null, field: null, degree: 'Master of Business Administration', school: 'XLRI - Xavier School of Management, Jamshedpur' },
  { year: 2014, field: null, degree: 'ICSE', school: 'J. H. Tarapore School - India' },
  { year: 2021, field: null, degree: 'Undergraduate', school: 'Birla Institute of Technology, Mesra' },
  { year: 2016, field: null, degree: 'CBSE', school: 'D.A.V. Public School, Bistupur, Jamshedpur' },
]

describe('tidyEducation', () => {
  it('one entry per qualification, most recent first', () => {
    expect(tidyEducation(FARHEEN).map((e) => `${e.school} · ${e.degree} · ${e.year}`)).toEqual([
      'XLRI Jamshedpur · Master of Business Administration - MBA · 2023',
      'Birla Institute of Technology, Mesra · Bachelor of Architecture · 2021',
      'D.A.V. Public School, Bistupur, Jamshedpur · CBSE · 2016',
      'J. H. Tarapore School - India · ICSE · 2014',
    ])
  })

  it('the fuller entry borrows what it lacks', () => {
    const out = tidyEducation([
      { school: 'XLRI - Xavier School of Management, Jamshedpur', degree: 'MBA', field: 'Human Resources', year: null },
      { school: 'XLRI Jamshedpur', degree: 'Undergraduate', field: null, year: 2023 },
    ])
    // The dated entry leads; it takes the real degree and the field from the other.
    expect(out).toEqual([{ school: 'XLRI Jamshedpur', degree: 'MBA', field: 'Human Resources', year: 2023 }])
  })

  it('keeps different institutions and different qualifications apart', () => {
    const out = tidyEducation([
      { school: 'Indian Institute of Technology, Delhi', degree: 'B.Tech', year: 2015 },
      { school: 'Indian Institute of Management, Delhi', degree: 'MBA', year: 2019 },
      { school: 'IIT Bombay', degree: 'M.Tech', year: 2017 },
      { school: 'IIT Bombay', degree: 'B.Tech', year: 2015 },
      { school: 'St. Xavier\'s', degree: 'Class X', year: null },
      { school: 'St. Xavier\'s', degree: 'Class XII', year: null },
    ])
    expect(out).toHaveLength(6)
    expect(out.map((e) => e.year)).toEqual([2019, 2017, 2015, 2015, null, null])
  })

  it('undated: the same degree written longer is one entry', () => {
    expect(tidyEducation([
      { school: 'The University of Texas at Austin', degree: 'Bachelor of Science and Arts', year: null },
      { school: 'The University of Texas at Austin', degree: 'Bachelor of Science and Arts - BSA', year: null },
    ])).toHaveLength(1)
  })

  it('a later degree at the same school is a second entry, not a merge', () => {
    expect(tidyEducation([
      { school: 'BITS Pilani', degree: 'B.E.', year: 2014 },
      { school: 'BITS Pilani', degree: 'M.E.', year: 2016 },
    ])).toHaveLength(2)
  })

  it('handles empty input and drops blank rows', () => {
    expect(tidyEducation(null)).toEqual([])
    expect(tidyEducation([{ school: null, degree: null, field: null, year: 2020 }])).toEqual([])
  })
})
