const { execFileSync } = require('child_process')

const from = process.argv[2]
const to = process.argv[3] ?? 'HEAD'
const range = from ? `${from}..${to}` : to

const output = execFileSync('git', ['log', '--reverse', '--pretty=format:%s', range], {
  encoding: 'utf8'
}).trim()

if (!output) {
  console.log('No changes found.')
  process.exit(0)
}

const sections = {
  Added: [],
  Changed: [],
  Fixed: [],
  Improved: []
}

for (const subject of output.split('\n')) {
  if (/^(add|create|ship)/i.test(subject)) sections.Added.push(subject)
  else if (/^(fix|restore)/i.test(subject)) sections.Fixed.push(subject)
  else if (/^(improve|harden|polish)/i.test(subject)) sections.Improved.push(subject)
  else sections.Changed.push(subject)
}

for (const [section, items] of Object.entries(sections)) {
  if (items.length === 0) continue
  console.log(`\n### ${section}\n`)
  for (const item of items) console.log(`- ${item}`)
}
