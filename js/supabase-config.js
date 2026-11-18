
"use strict";

/**
 * Air Ticket Agency Management
 * Supabase Public Configuration
 */

window.APP_CONFIG = Object.freeze({

    // Supabase Project URL
    supabaseUrl: "https://forphflzmhxsbjouqvwo.supabase.co",

    // Supabase Anon / Publishable Key
    supabaseAnonKey: "sb_publishable_N6eCqWGNESTlPtseRcy4aQ_Dt1zSnUw"

});


// Validate Configuration
window.isSupabaseConfigured = function () {

    const config = window.APP_CONFIG;

    return Boolean(
        config &&
        config.supabaseUrl &&
        config.supabaseAnonKey &&
        config.supabaseUrl !== "YOUR_SUPABASE_PROJECT_URL" &&
        config.supabaseAnonKey !== "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY"
    );

};
