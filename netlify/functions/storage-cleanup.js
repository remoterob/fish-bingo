import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY // needs service key to delete files
)

// Subscribe to Postgres changes
export const handler = async () => {
  const channel = supabase
    .channel('claim-delete-listener')
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'claims' }, async (payload) => {
      const { photo_url, thumb_url } = payload.old
      const urls = [photo_url, thumb_url].filter(Boolean)

      for (const url of urls) {
        const path = url.replace(
          `${process.env.VITE_SUPABASE_URL}/storage/v1/object/public/fish-uploads/`,
          ''
        )
        await supabase.storage.from('fish-uploads').remove([path])
        console.log(`🗑️ Deleted: ${path}`)
      }
    })
    .subscribe()

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Storage cleanup listener running' })
  }
}
