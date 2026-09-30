/**
 * controllers/analyticsController.js
 * Dashboard counters for the admin panel.
 */
import Enquiry from "../models/Enquiry.js";
import Review from "../models/Review.js";
import Design from "../models/Design.js";
import UpcomingEvent from "../models/UpcomingEvent.js";
import CustomerUpload from "../models/CustomerUpload.js";

export async function getStats(req, res, next) {
  try {
    const [totalEnquiries, newEnquiries, pendingReviews, approvedReviews, activeDesigns, liveEvents, pendingUploads] =
      await Promise.all([
        Enquiry.countDocuments(),
        Enquiry.countDocuments({ status: "new" }),
        Review.countDocuments({ status: "pending" }),
        Review.countDocuments({ status: "approved" }),
        Design.countDocuments({ active: true }),
        UpcomingEvent.findLive().then((d) => d.length),
        CustomerUpload.countDocuments({ status: "pending" }),
      ]);

    res.json({
      stats: {
        totalEnquiries,
        newEnquiries,
        pendingReviews,
        approvedReviews,
        activeDesigns,
        liveEvents,
        pendingUploads,
      },
    });
  } catch (err) {
    next(err);
  }
}
