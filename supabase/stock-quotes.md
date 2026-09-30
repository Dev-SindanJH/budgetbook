# 국내 주식 시세 연결

보유 주식의 평가금액은 KRX의 최근 제공 종가와 보유 수량으로 계산합니다. 장중 실시간 가격은 사용하지 않습니다.

1. [KRX OPEN API](https://openapi.krx.co.kr/contents/OPP/INFO/OPPINFO003.jsp)에서 인증키를 신청합니다.
2. **유가증권 일별매매정보**와 **코스닥 일별매매정보** 두 API의 이용 승인을 받습니다.
3. BudgetBook Supabase 프로젝트의 **Edge Function Secrets**에 `KRX_API_KEY`라는 이름으로 키를 저장합니다. 키를 `VITE_` 환경변수나 소스 파일에 넣지 않습니다.
4. `stock-quotes` Edge Function을 배포합니다. 함수는 로그인한 사용자만 호출할 수 있어야 합니다(`verify_jwt = true`).

종목은 6자리 코드와 시장(KOSPI/KOSDAQ)으로 등록합니다. KRX가 제공한 가장 최근 종가의 날짜를 종목별로 보여줍니다. 시세를 가져오지 못한 종목은 평가 합계에서 제외합니다.
