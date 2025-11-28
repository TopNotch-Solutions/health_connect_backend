// Migration script to add icon and provider to all existing ailments
// Run this once to populate the existing 44 ailments with icon and provider data

require("dotenv").config();
const mongoose = require("mongoose");
const AilmentCategory = require("../models/ailment");

const ailmentData = [
  // Doctor - General/Common Ailments
  { title: "Flu, Cold & Cough Symptoms", provider: "Doctor", icon: "wind" },
  { title: "Sore Throat & Ear Ache", provider: "Doctor", icon: "alert-circle" },
  { title: "My Child Has a Fever or is Unwell", provider: "Doctor", icon: "thermometer" },
  { title: "Vomiting, Diarrhea, or Stomach Pain", provider: "Doctor", icon: "activity" },
  { title: "New or Worsening Skin Rash", provider: "Doctor", icon: "alert-octagon" },
  { title: "Allergic Reactions or Bites", provider: "Doctor", icon: "alert-triangle" },
  { title: "Minor Cuts that Might Need Stitches", provider: "Doctor", icon: "scissors" },
  { title: "Headaches or Migraines", provider: "Doctor", icon: "activity" },
  { title: "Bladder Infection / UTI Symptoms", provider: "Doctor", icon: "alert-circle" },
  { title: "Follow-up After Hospital Stay", provider: "Doctor", icon: "check-circle" },
  { title: "Elderly Parent Wellness Check", provider: "Doctor", icon: "heart" },
  { title: "Prescription Renewal Consultation", provider: "Doctor", icon: "file-text" },

  // Nurse - Health Monitoring & Care
  { title: "General Health Check-up", provider: "Nurse", icon: "clipboard" },
  { title: "Blood Pressure & Sugar Monitoring", provider: "Nurse", icon: "trending-up" },
  { title: "Wound Dressing Change (Simple)", provider: "Nurse", icon: "bandage" },
  { title: "Complex or Post-Op Wound Care", provider: "Nurse", icon: "alert-octagon" },
  { title: "Stitch or Staple Removal", provider: "Nurse", icon: "scissors" },
  { title: "Medication Injection", provider: "Nurse", icon: "droplet" },
  { title: "Help After Surgery", provider: "Nurse", icon: "heart" },
  { title: "Elderly Home Care Support", provider: "Nurse", icon: "home" },
  { title: "Newborn & Mom Wellness Check", provider: "Nurse", icon: "smile" },
  { title: "Comfort & Support During Illness", provider: "Nurse", icon: "heart" },

  // Social Worker - Mental Health & Support
  { title: "Feeling Overwhelmed, Stressed, or Anxious", provider: "Social Worker", icon: "brain" },
  { title: "Coping with Grief or Loss", provider: "Social Worker", icon: "heart-broken" },
  { title: "Family Conflicts or Arguments", provider: "Social Worker", icon: "users" },
  { title: "Parenting Challenges & Guidance", provider: "Social Worker", icon: "user-check" },
  { title: "Support for a Child's Behavioral Issues", provider: "Social Worker", icon: "alert-circle" },
  { title: "Support for an Elderly Family Member", provider: "Social Worker", icon: "heart" },
  { title: "Caregiver Stress & Burnout", provider: "Social Worker", icon: "battery" },
  { title: "Coping with a New or Chronic Diagnosis", provider: "Social Worker", icon: "info" },
  { title: "Need to Talk About Substance Use", provider: "Social Worker", icon: "alert-triangle" },
  { title: "Dealing with a Traumatic Event", provider: "Social Worker", icon: "alert-octagon" },

  // Physiotherapist - Physical Rehabilitation
  { title: "Back, Neck, or Shoulder Pain", provider: "Physiotherapist", icon: "activity" },
  { title: "Knee, Ankle, or Foot Pain", provider: "Physiotherapist", icon: "activity" },
  { title: "Recovery from a Sprain or Strain", provider: "Physiotherapist", icon: "alert-circle" },
  { title: "Rehabilitation After a Broken Bone", provider: "Physiotherapist", icon: "target" },
  { title: "Help with Arthritis or Joint Stiffness", provider: "Physiotherapist", icon: "activity" },
  { title: "Difficulty Walking or Poor Balance", provider: "Physiotherapist", icon: "navigation" },
  { title: "Exercises After Hip/Knee Replacement", provider: "Physiotherapist", icon: "activity" },
  { title: "Recovery & Movement Help After a Stroke", provider: "Physiotherapist", icon: "activity" },
  { title: "Assessment of a Sports Injury", provider: "Physiotherapist", icon: "target" },
];

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("📦 Connected to MongoDB");

    let updated = 0;
    let notFound = 0;

    for (const data of ailmentData) {
      try {
        const result = await AilmentCategory.updateOne(
          { title: data.title },
          { 
            $set: {
              provider: data.provider,
              icon: data.icon
            }
          }
        );
        
        if (result.matchedCount > 0) {
          updated++;
          console.log(`✅ Updated: ${data.title}`);
        } else {
          notFound++;
          console.log(`⚠️ Not found: ${data.title}`);
        }
      } catch (error) {
        console.error(`❌ Error updating ${data.title}:`, error.message);
      }
    }

    console.log("\n📊 Migration Summary:");
    console.log(`✅ Updated: ${updated} ailments`);
    console.log(`⚠️ Not found: ${notFound} ailments`);

    await mongoose.connection.close();
    console.log("✨ Migration complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

migrate();
