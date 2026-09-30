/**
 * routes/public.js — public read API + lead capture. Rate limited.
 */
import { Router } from "express";
import { body } from "express-validator";
import * as publicCtl from "../controllers/publicController.js";
import { createEnquiry } from "../controllers/enquiryController.js";
import { submitReview, submitUpload } from "../controllers/reviewController.js";
import { uploadSingle } from "../middleware/upload.js";
import { handleValidation } from "../middleware/validate.js";
import { enquiryLimiter, submissionLimiter, uploadLimiter } from "../middleware/security.js";
import { trackView } from "../controllers/publicController.js";

const router = Router();

/* ---- reads ---- */
router.get("/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));
router.get("/bootstrap", publicCtl.getBootstrap);
router.get("/locations", publicCtl.getLocations);
router.get("/categories", publicCtl.getCategories);
router.get("/home-sections", publicCtl.getHomeSections);
router.get("/designs", publicCtl.getDesigns);
router.get("/designs/:slug", publicCtl.getDesign);
router.get("/category/:slug", publicCtl.getDesignsByCategory);
router.get("/gallery", publicCtl.getGallery);
router.get("/events", publicCtl.getEvents);
router.get("/reviews", publicCtl.getReviews);
router.get("/videos", publicCtl.getVideos);
router.get("/instagram", publicCtl.getInstagram);
router.get("/social", publicCtl.getSocialLinks);

/* ---- writes ---- */
router.post(
  "/enquiries",
  enquiryLimiter,
  [
    body("name").isLength({ min: 2, max: 120 }).withMessage("Please enter your name."),
    body("phone").isLength({ min: 7, max: 20 }).withMessage("A valid phone number is required."),
  ],
  handleValidation,
  createEnquiry
);

router.post(
  "/reviews",
  submissionLimiter,
  [
    body("name").isLength({ min: 2, max: 120 }).withMessage("Please enter your name."),
    body("rating").isInt({ min: 1, max: 5 }).withMessage("Choose a rating between 1 and 5."),
    body("text").isLength({ min: 5, max: 1500 }).withMessage("Please write at least a few words."),
  ],
  handleValidation,
  submitReview
);

router.post("/uploads", uploadLimiter, uploadSingle, submitUpload);
router.post("/track", trackView);

export default router;
