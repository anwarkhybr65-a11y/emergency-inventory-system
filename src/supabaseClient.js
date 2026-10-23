import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://stcqavlqgitzcbmovfgw.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_BhMudnlEhtdfOE2HxmZ5WQ_HWeanedR'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)