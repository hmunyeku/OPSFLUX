FROM adminer:5.4.1

# Download Adminer PHP file
RUN wget https://github.com/vrana/adminer/releases/download/v4.8.1/adminer-4.8.1.php -O /var/www/html/adminer-4.8.1.php

# Copy plugin base class, custom plugin and index
COPY plugin.php /var/www/html/plugin.php
COPY login-token.php /var/www/html/login-token.php
COPY index.php /var/www/html/index.php

# Add environment variable for backend URL
ENV BACKEND_URL=http://backend:8000
