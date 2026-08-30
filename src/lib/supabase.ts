import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hcefsusfvshpuxmpwypz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWZzdXNmdnNocHV4bXB3eXB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NjYzMzIsImV4cCI6MjA4MDE0MjMzMn0.ByMlc4141M-_Laf60_bU6uVnxYEmrQjTZheIcR5Lf8U';

export const supabase = createClient(supabaseUrl, supabaseKey);
