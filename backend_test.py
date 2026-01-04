import requests
import sys
import json
from datetime import datetime
import time

class TrafficWatchAPITester:
    def __init__(self, base_url="https://trafficwatch-12.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session_token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            "test_name": name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if details:
            print(f"    Details: {details}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, cookies=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if headers:
            test_headers.update(headers)
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, cookies=cookies)
            elif method == 'POST':
                if isinstance(data, dict):
                    response = requests.post(url, json=data, headers=test_headers, cookies=cookies)
                else:
                    response = requests.post(url, data=data, headers=test_headers, cookies=cookies)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, cookies=cookies)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, cookies=cookies)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}, Expected: {expected_status}"
            
            if not success:
                try:
                    error_data = response.json()
                    details += f", Response: {error_data}"
                except:
                    details += f", Response: {response.text[:200]}"
            
            self.log_test(name, success, details)
            
            return success, response.json() if success and response.content else {}

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def create_test_session(self):
        """Create test user session using MongoDB"""
        print("\n🔧 Creating test user session...")
        
        import subprocess
        
        # Create test user and session via MongoDB
        mongo_script = f'''
        use('test_database');
        var userId = 'test-user-{int(time.time())}';
        var sessionToken = 'test_session_{int(time.time())}';
        db.users.insertOne({{
          id: userId,
          email: 'test.user.{int(time.time())}@example.com',
          name: 'Test User',
          picture: 'https://via.placeholder.com/150',
          created_at: new Date()
        }});
        db.user_sessions.insertOne({{
          user_id: userId,
          session_token: sessionToken,
          expires_at: new Date(Date.now() + 7*24*60*60*1000),
          created_at: new Date()
        }});
        print('SESSION_TOKEN:' + sessionToken);
        print('USER_ID:' + userId);
        '''
        
        try:
            result = subprocess.run(['mongosh', '--eval', mongo_script], 
                                  capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                output_lines = result.stdout.split('\n')
                for line in output_lines:
                    if 'SESSION_TOKEN:' in line:
                        self.session_token = line.split('SESSION_TOKEN:')[1].strip()
                    elif 'USER_ID:' in line:
                        self.user_id = line.split('USER_ID:')[1].strip()
                
                if self.session_token and self.user_id:
                    print(f"✅ Test session created - User ID: {self.user_id}")
                    return True
                else:
                    print("❌ Failed to extract session token from MongoDB output")
                    return False
            else:
                print(f"❌ MongoDB command failed: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"❌ Error creating test session: {str(e)}")
            return False

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        print("\n🔐 Testing Authentication Endpoints...")
        
        # Test /auth/me without session
        self.run_test(
            "Auth Me - Unauthenticated",
            "GET",
            "auth/me",
            401
        )
        
        # Test /auth/me with session
        if self.session_token:
            cookies = {'session_token': self.session_token}
            success, response = self.run_test(
                "Auth Me - Authenticated",
                "GET",
                "auth/me",
                200,
                cookies=cookies
            )
            
            if success and response.get('id') == self.user_id:
                self.log_test("Auth Me - User Data Validation", True, "User data matches")
            else:
                self.log_test("Auth Me - User Data Validation", False, "User data mismatch")

    def test_video_endpoints(self):
        """Test video-related endpoints"""
        print("\n🎥 Testing Video Endpoints...")
        
        if not self.session_token:
            print("❌ No session token available for video tests")
            return
        
        cookies = {'session_token': self.session_token}
        
        # Test get videos (empty initially)
        self.run_test(
            "Get Videos - Empty List",
            "GET",
            "videos",
            200,
            cookies=cookies
        )
        
        # Test video upload endpoint (without actual file)
        self.run_test(
            "Video Upload - No File",
            "POST",
            "videos/upload",
            422,  # Unprocessable Entity for missing file
            cookies=cookies
        )

    def test_violations_endpoints(self):
        """Test violation-related endpoints"""
        print("\n⚠️ Testing Violations Endpoints...")
        
        if not self.session_token:
            print("❌ No session token available for violations tests")
            return
        
        cookies = {'session_token': self.session_token}
        
        # Test get violations (empty initially)
        self.run_test(
            "Get Violations - Empty List",
            "GET",
            "violations",
            200,
            cookies=cookies
        )

    def test_calibration_endpoints(self):
        """Test calibration endpoints"""
        print("\n📏 Testing Calibration Endpoints...")
        
        if not self.session_token:
            print("❌ No session token available for calibration tests")
            return
        
        cookies = {'session_token': self.session_token}
        
        # Test get calibration (none initially)
        success, response = self.run_test(
            "Get Calibration - None Exists",
            "GET",
            "calibration",
            200,
            cookies=cookies
        )
        
        # Test create calibration
        calibration_data = {
            "name": "Test Zone",
            "reference_distance": 5.0,
            "pixel_points": [[100, 100], [500, 100]],
            "speed_limit": 60
        }
        
        success, response = self.run_test(
            "Create Calibration",
            "POST",
            "calibration",
            200,
            data=calibration_data,
            cookies=cookies
        )
        
        if success:
            # Test get calibration after creation
            self.run_test(
                "Get Calibration - After Creation",
                "GET",
                "calibration",
                200,
                cookies=cookies
            )

            # Create a second calibration and ensure GET returns the latest (should pick most recent by created_at)
            calibration_data2 = {
                "name": "Test Zone 2",
                "reference_distance": 3.0,
                "pixel_points": [[200, 120], [520, 120]],
                "speed_limit": 50
            }
            success, response = self.run_test(
                "Create Calibration - Second",
                "POST",
                "calibration",
                200,
                data=calibration_data2,
                cookies=cookies
            )

            # Verify GET returns the recently created calibration
            success_get, response_get = self.run_test(
                "Get Calibration - After Second Creation",
                "GET",
                "calibration",
                200,
                cookies=cookies
            )
            if success_get:
                expected = 3.0
                actual = response_get.get("reference_distance")
                if actual == expected:
                    self.log_test("Calibration latest returned correct distance", True)
                else:
                    self.log_test("Calibration latest returned correct distance", False, f"Expected {expected}, got {actual}")

                # Also verify speed_limit is returned correctly
                expected_speed = 50
                actual_speed = response_get.get("speed_limit")
                if actual_speed == expected_speed:
                    self.log_test("Calibration latest returned correct speed_limit", True)
                else:
                    self.log_test("Calibration latest returned correct speed_limit", False, f"Expected {expected_speed}, got {actual_speed}")

    def test_stats_endpoint(self):
        """Test stats endpoint"""
        print("\n📊 Testing Stats Endpoint...")
        
        if not self.session_token:
            print("❌ No session token available for stats tests")
            return
        
        cookies = {'session_token': self.session_token}
        
        success, response = self.run_test(
            "Get Stats",
            "GET",
            "stats",
            200,
            cookies=cookies
        )
        
        if success:
            expected_keys = ['total_videos', 'total_violations', 'violations_by_type']
            has_all_keys = all(key in response for key in expected_keys)
            self.log_test(
                "Stats Response Structure",
                has_all_keys,
                f"Has keys: {list(response.keys())}"
            )

    def test_logout_endpoint(self):
        """Test logout endpoint"""
        print("\n🚪 Testing Logout Endpoint...")
        
        if not self.session_token:
            print("❌ No session token available for logout test")
            return
        
        cookies = {'session_token': self.session_token}
        
        self.run_test(
            "Logout",
            "POST",
            "auth/logout",
            200,
            cookies=cookies
        )
        
        # Test that session is invalidated
        self.run_test(
            "Auth Me - After Logout",
            "GET",
            "auth/me",
            401,
            cookies=cookies
        )

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting TrafficWatch API Tests...")
        print(f"🌐 Testing against: {self.base_url}")
        
        # Create test session
        if not self.create_test_session():
            print("❌ Failed to create test session. Stopping tests.")
            return False
        
        # Run all test suites
        self.test_auth_endpoints()
        self.test_video_endpoints()
        self.test_violations_endpoints()
        self.test_calibration_endpoints()
        self.test_stats_endpoint()
        self.test_logout_endpoint()
        
        # Print summary
        print(f"\n📊 Test Summary:")
        print(f"   Total Tests: {self.tests_run}")
        print(f"   Passed: {self.tests_passed}")
        print(f"   Failed: {self.tests_run - self.tests_passed}")
        print(f"   Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    tester = TrafficWatchAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    with open('/app/test_reports/backend_test_results.json', 'w') as f:
        json.dump({
            'summary': {
                'total_tests': tester.tests_run,
                'passed_tests': tester.tests_passed,
                'failed_tests': tester.tests_run - tester.tests_passed,
                'success_rate': (tester.tests_passed/tester.tests_run*100) if tester.tests_run > 0 else 0
            },
            'detailed_results': tester.test_results,
            'timestamp': datetime.now().isoformat()
        }, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())