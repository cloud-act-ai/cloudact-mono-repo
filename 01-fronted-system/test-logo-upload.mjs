import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

console.log('Testing Supabase Storage bucket access...')
console.log('---')

// Test 1: Check if bucket exists
console.log('\n1. Checking if org-logos bucket exists...')
try {
  const { data: buckets, error } = await supabase.storage.listBuckets()
  
  if (error) {
    console.error('   ✗ Error listing buckets:', error.message)
  } else {
    const orgLogosBucket = buckets.find(b => b.id === 'org-logos')
    if (orgLogosBucket) {
      console.log('   ✓ org-logos bucket exists')
      console.log('   Details:', JSON.stringify(orgLogosBucket, null, 2))
    } else {
      console.error('   ✗ org-logos bucket NOT FOUND')
      console.log('   Available buckets:', buckets.map(b => b.id).join(', '))
    }
  }
} catch (err) {
  console.error('   ✗ Exception:', err.message)
}

// Test 2: Try listing files in bucket
console.log('\n2. Trying to list files in org-logos bucket...')
try {
  const { data: files, error } = await supabase.storage
    .from('org-logos')
    .list()
  
  if (error) {
    console.error('   ✗ Error listing files:', error.message)
  } else {
    console.log(`   ✓ Can list files (found ${files.length} items)`)
    if (files.length > 0) {
      console.log('   Sample:', files.slice(0, 3).map(f => f.name))
    }
  }
} catch (err) {
  console.error('   ✗ Exception:', err.message)
}

console.log('\n---')
console.log('Test complete')
