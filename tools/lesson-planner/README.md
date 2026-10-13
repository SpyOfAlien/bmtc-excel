# Kế hoạch giáo dục cá nhân

Bản thử nghiệm Python được giữ để đối chiếu. Bản ứng dụng hiện tại dùng [Next.js và triển khai Cloudflare](../../apps/lesson-planner/README.md).

Ứng dụng chạy trên máy, dùng AG Grid Community 36.2.0 để hiển thị bảng. Không dùng tài khoản, máy chủ bên ngoài, CDN hoặc lưu bản nháp.

## Mở ứng dụng

Trên macOS, mở `Start.command`, rồi vào địa chỉ được hiển thị. Máy cần Python 3.10 trở lên. Hoặc chạy từ thư mục này:

```sh
python3 server.py
```

Mặc định ứng dụng mở trình duyệt tại http://127.0.0.1:8765. Để chọn cổng khác:

```sh
python3 server.py --port 8766
```

Nhấn Control+C trong cửa sổ đang chạy để tắt ứng dụng.

## Sử dụng

1. Chọn tháng/năm và thư mục chứa `KEHOACHMOI.xlsx`. Chọn tệp trong danh sách rồi nhấn **Dùng mẫu này**. Có thể chọn trực tiếp tệp thay vì thư mục.
2. Nhập tên học sinh, tuổi, giáo viên, QLCM và tháng/tuần.
3. Nhấn **Thêm bài**, tìm bài số rồi chọn điểm cần đạt. Tên bài, mục tiêu, hướng dẫn và tiêu chí lấy từ tham khảo. Không chọn trùng bài trong một học sinh.
4. **Thêm học sinh** tạo kế hoạch mới, xóa tên và bài học, giữ các thông tin còn lại. Chuyển qua các học sinh ở cột bên trái để sửa.
5. Tra cứu `Ko dc xoa` ở cột bên phải. Chọn hàng để đọc đầy đủ nội dung. Bảng này chỉ đọc.
6. Nhấn **Xuất Excel**, chọn nơi lưu và nhấn **Lưu workbook**. Thư mục chứa mẫu là nơi lưu mặc định nếu chọn thư mục ở bước đầu. File là `KeHoach_Thang10_2026.xlsx`; trùng tên tự thêm `_v2`, `_v3`… Không ghi đè mẫu.

Chrome/Edge hỗ trợ chọn thư mục và lưu trực tiếp. Các trình duyệt không hỗ trợ File System Access dùng **Tải xuống qua trình duyệt**. Khi dùng tải xuống, trình duyệt quyết định nơi lưu và hậu tố tên trùng; bật chế độ hỏi nơi lưu trong thiết lập trình duyệt nếu cần.

Tải lại/đóng trang sẽ mất nội dung đang nhập. Hai cửa sổ ứng dụng có phiên riêng. Dữ liệu mẫu chỉ giữ trong bộ nhớ của tiến trình, các kế hoạch chỉ giữ trong bộ nhớ trang. Không có tự động lưu. File Excel đã xuất giữ lại bình thường.

## Workbook xuất

Mỗi học sinh là một sheet theo thứ tự nhập. Tên sheet thay các ký tự Excel cấm bằng khoảng trắng, giới hạn 31 ký tự và thêm số khi tên trùng. Tên học sinh trong ô C6 giữ nguyên.

Chỉ xuất các sheet học sinh, không xuất sheet mẫu hoặc sheet tham khảo. Tất cả ô là giá trị, không có công thức. Các hàng mẫu cũ xóa nội dung; cột G và H để trống. Trung tâm, logo, kiểu chữ, màu, ô gộp, chiều rộng cột, chiều cao hàng và thiết lập trang giữ từ KHGDCN. Nội dung dài có thể bị cắt theo chiều cao hàng cố định của mẫu. Tháng/tuần đặt dưới nhãn ở ô gộp G6:G7.

Mẫu hiện tại có ô điểm gộp E23:E26. Ứng dụng bỏ qua hàng 24–26 để mỗi bài có một điểm riêng, giữ nguyên các ô gộp.

Thang điểm theo mã như `A5.2` hiển thị và xuất là `2`, như mẫu gốc. Các thang điểm khác giữ nguyên văn bản. 54 thang điểm trong mẫu hiện lưu thành ngày Excel; ứng dụng hiển thị/xuất ngày dạng `YYYY-MM-DD`, không đoán thành khoảng điểm. Bài không có thang điểm chỉ dùng tham khảo. Mã bài trùng trong nguồn dùng nhóm đầu tiên, tương tự VLOOKUP; bảng tham khảo vẫn giữ mọi hàng.

Ứng dụng chỉ hỗ trợ mẫu có KHGDCN với tiêu đề A8:F8 và Ko dc xoa với tiêu đề A2:F2 đúng mẫu hiện tại. Hình ảnh/logo hỗ trợ; macro, liên kết ngoài và các đối tượng nhúng khác không hỗ trợ. Mẫu gốc không bị sửa.

## Kiểm tra

```sh
python3 -m unittest discover -s tests -v
```

Kiểm tra dùng workbook trong `../../ref/KEHOACHMOI.xlsx`, không sửa file đó. Các bài kiểm tra kiểm tra lookup, dữ liệu không hợp lệ, trùng bài, sheet names, nội dung cũ, công thức, ô gộp, styles, hàng/cột và logo.

## Cấu trúc

`workbook.py` đọc và xuất OOXML bằng thư viện chuẩn Python. `server.py` chỉ lắng nghe trên loopback, kiểm tra Host/Origin và token riêng mỗi phiên. `static/` chứa giao diện, cùng AG Grid được vendored và giấy phép MIT. Không cần cài npm hoặc thư viện Python.
