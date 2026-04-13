from datetime import date, timedelta
import unittest

from status_engine import determine_tracking_status


def _d(days_ago: int) -> str:
    return (date.today() - timedelta(days=days_ago)).strftime("%Y-%m-%d")


class TestDetermineTrackingStatus(unittest.TestCase):
    def test_normal_delivered(self) -> None:
        events = [
            {
                "date": _d(3),
                "time": "10:00",
                "location": "LHR",
                "description": "Dispatch from DMO",
                "bag_id": None,
            },
            {
                "date": _d(2),
                "time": "09:20",
                "location": "LHR",
                "description": "Sent out for delivery",
                "bag_id": None,
            },
            {
                "date": _d(2),
                "time": "12:40",
                "location": "LHR",
                "description": "Delivered to addressee",
                "bag_id": None,
            },
        ]
        result = determine_tracking_status(events, article_type="RGL", amount=0)
        self.assertEqual(result["final_status"], "Delivered")
        self.assertEqual(result["current_cycle"], 1)
        self.assertEqual(result["cycle_description"], "Delivered Loop 1")
        self.assertFalse(result["is_complaint_enabled"])

    def test_vpl_with_mos_completed(self) -> None:
        events = [
            {
                "date": _d(6),
                "time": "11:00",
                "location": "KHI",
                "description": "Dispatch from DMO",
                "bag_id": None,
            },
            {
                "date": _d(5),
                "time": "10:15",
                "location": "KHI",
                "description": "MOS Issued Number MOSA12345",
                "bag_id": None,
            },
            {
                "date": _d(4),
                "time": "09:00",
                "location": "KHI",
                "description": "Dispatch from DMO",
                "bag_id": None,
            },
            {
                "date": _d(3),
                "time": "15:45",
                "location": "KHI",
                "description": "Delivered to addressee",
                "bag_id": None,
            },
        ]
        result = determine_tracking_status(events, article_type="VPL", amount=2500)
        self.assertEqual(result["final_status"], "Delivered")
        self.assertEqual(result["mos_id"], "MOSA12345")
        self.assertEqual(result["cycle_description"], "Delivered Loop 1")

    def test_simple_return(self) -> None:
        events = [
            {
                "date": _d(4),
                "time": "08:30",
                "location": "ISB",
                "description": "Dispatch from DMO",
                "bag_id": None,
            },
            {
                "date": _d(3),
                "time": "10:00",
                "location": "ISB",
                "description": "Undelivered due to address issue",
                "bag_id": None,
            },
            {
                "date": _d(2),
                "time": "14:00",
                "location": "ISB",
                "description": "Return to sender completed",
                "bag_id": None,
            },
        ]
        result = determine_tracking_status(events, article_type="RGL", amount=0)
        self.assertEqual(result["final_status"], "Return")
        self.assertEqual(result["current_cycle"], 1)
        self.assertEqual(result["cycle_description"], "Return Loop 1")

    def test_reforwarded_delivered_loop_2(self) -> None:
        events = [
            {
                "date": _d(9),
                "time": "09:00",
                "location": "MUX",
                "description": "Dispatch from DMO",
                "bag_id": None,
            },
            {
                "date": _d(8),
                "time": "10:10",
                "location": "MUX",
                "description": "Sent out for delivery",
                "bag_id": None,
            },
            {
                "date": _d(8),
                "time": "17:00",
                "location": "MUX",
                "description": "Undelivered",
                "bag_id": None,
            },
            {
                "date": _d(7),
                "time": "12:00",
                "location": "MUX",
                "description": "Return to origin",
                "bag_id": None,
            },
            {
                "date": _d(6),
                "time": "09:05",
                "location": "MUX",
                "description": "Dispatch from DMO",
                "bag_id": None,
            },
            {
                "date": _d(5),
                "time": "11:30",
                "location": "MUX",
                "description": "Delivered to addressee",
                "bag_id": None,
            },
        ]
        result = determine_tracking_status(events, article_type="PAR", amount=0)
        self.assertEqual(result["final_status"], "Delivered")
        self.assertEqual(result["current_cycle"], 2)
        self.assertEqual(result["cycle_description"], "Delivered Loop 2")

    def test_reforwarded_twice_return_loop_3(self) -> None:
        events = [
            {"date": _d(16), "time": "09:00", "location": "LHE", "description": "Dispatch from DMO", "bag_id": None},
            {"date": _d(15), "time": "10:00", "location": "LHE", "description": "Undelivered", "bag_id": None},
            {"date": _d(14), "time": "11:00", "location": "LHE", "description": "Return to sender", "bag_id": None},
            {"date": _d(13), "time": "08:45", "location": "LHE", "description": "Dispatch from DMO", "bag_id": None},
            {"date": _d(12), "time": "10:00", "location": "LHE", "description": "Refused by consignee", "bag_id": None},
            {"date": _d(11), "time": "12:00", "location": "LHE", "description": "Return to origin", "bag_id": None},
            {"date": _d(10), "time": "08:20", "location": "LHE", "description": "Dispatch from DMO", "bag_id": None},
            {"date": _d(9), "time": "16:10", "location": "LHE", "description": "Return to sender completed", "bag_id": None},
        ]
        result = determine_tracking_status(events, article_type="RGL", amount=0)
        self.assertEqual(result["final_status"], "Return")
        self.assertEqual(result["current_cycle"], 3)
        self.assertEqual(result["cycle_description"], "Return Loop 3")

    def test_no_movement_over_8_days_pending(self) -> None:
        events = [
            {
                "date": _d(11),
                "time": "10:00",
                "location": "PEW",
                "description": "Dispatch from DMO",
                "bag_id": None,
            }
        ]
        result = determine_tracking_status(events, article_type="COD", amount=1200)
        self.assertEqual(result["final_status"], "Pending")
        self.assertTrue(result["is_complaint_enabled"])
        self.assertEqual(result["cycle_description"], "Pending Loop 1")

    def test_delivery_office_arrival_is_not_delivered(self) -> None:
        events = [
            {
                "date": _d(2),
                "time": "09:00",
                "location": "LHR",
                "description": "Dispatch to delivery office",
                "bag_id": None,
            },
            {
                "date": _d(1),
                "time": "11:00",
                "location": "LHR",
                "description": "Arrived at delivery office",
                "bag_id": None,
            },
        ]
        result = determine_tracking_status(events, article_type="RGL", amount=0)
        self.assertEqual(result["final_status"], "Pending")
        self.assertEqual(result["current_cycle"], 1)

    def test_events_sorted_with_missing_time(self) -> None:
        events = [
            {
                "date": _d(1),
                "time": "08:00",
                "location": "LHR",
                "description": "Delivered to addressee",
                "bag_id": None,
            },
            {
                "date": _d(2),
                "time": "",
                "location": "LHR",
                "description": "Dispatch from DMO",
                "bag_id": None,
            },
        ]
        result = determine_tracking_status(events, article_type="RGL", amount=0)
        self.assertEqual(result["final_status"], "Delivered")

    def test_mos_cycle_overrides_previous_article_history(self) -> None:
        events = [
            {
                "date": _d(6),
                "time": "09:00",
                "location": "ISB",
                "description": "Dispatch from DMO",
                "bag_id": None,
            },
            {
                "date": _d(5),
                "time": "10:00",
                "location": "ISB",
                "description": "Delivered",
                "bag_id": None,
            },
            {
                "date": _d(4),
                "time": "11:00",
                "location": "ISB",
                "description": "MOS Issued Number MOSB90001",
                "bag_id": None,
            },
            {
                "date": _d(1),
                "time": "13:00",
                "location": "ISB",
                "description": "Dispatch from DMO",
                "bag_id": None,
            },
        ]
        result = determine_tracking_status(events, article_type="VPL", amount=5000)
        self.assertEqual(result["mos_id"], "MOSB90001")
        self.assertEqual(result["final_status"], "Pending")

    def test_pending_complaint_based_on_last_scan_age(self) -> None:
        events = [
            {
                "date": _d(20),
                "time": "09:00",
                "location": "LHE",
                "description": "Dispatch from DMO",
                "bag_id": None,
            },
            {
                "date": _d(3),
                "time": "10:00",
                "location": "LHE",
                "description": "Arrived at delivery office",
                "bag_id": None,
            },
        ]
        result = determine_tracking_status(events, article_type="RGL", amount=0)
        self.assertEqual(result["final_status"], "Pending")
        self.assertFalse(result["complaint_enabled"])


if __name__ == "__main__":
    unittest.main()
