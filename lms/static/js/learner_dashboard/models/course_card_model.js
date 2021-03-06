/* globals gettext */

import _ from 'underscore';
import Backbone from 'backbone';

import DateUtils from 'edx-ui-toolkit/js/utils/date-utils';
import StringUtils from 'edx-ui-toolkit/js/utils/string-utils';

/**
 * Model for Course Programs.
 */
class CourseCardModel extends Backbone.Model {
  initialize(data) {
    if (data) {
      this.context = data;
      this.setActiveCourseRun(this.getCourseRun(data), data.user_preferences);
    }
  }

  getCourseRun(course) {
    const enrolledCourseRun = _.findWhere(course.course_runs, { is_enrolled: true });
    const openEnrollmentCourseRuns = this.getEnrollableCourseRuns();
    let desiredCourseRun;

    // If the learner has an existing, unexpired enrollment,
    // use it to populate the model.
    if (enrolledCourseRun && !course.expired) {
      desiredCourseRun = enrolledCourseRun;
    } else if (openEnrollmentCourseRuns.length > 0) {
      if (openEnrollmentCourseRuns.length === 1) {
        desiredCourseRun = openEnrollmentCourseRuns[0];
      } else {
        desiredCourseRun = CourseCardModel.getUnselectedCourseRun(openEnrollmentCourseRuns);
      }
    } else {
      desiredCourseRun = CourseCardModel.getUnselectedCourseRun(course.course_runs);
    }

    return desiredCourseRun;
  }

  isEnrolledInSession() {
    // Returns true if the user is currently enrolled in a session of the course
    return _.findWhere(this.context.course_runs, { is_enrolled: true }) !== undefined;
  }

  static getUnselectedCourseRun(courseRuns) {
    const unselectedRun = {};

    if (courseRuns && courseRuns.length > 0) {
      const courseRun = courseRuns[0];

      $.extend(unselectedRun, {
        marketing_url: courseRun.marketing_url,
        is_enrollment_open: courseRun.is_enrollment_open,
        key: courseRun.key || '',
        is_mobile_only: courseRun.is_mobile_only || false,
      });
    }

    return unselectedRun;
  }

  getEnrollableCourseRuns() {
    const rawCourseRuns = _.where(this.context.course_runs, {
      is_enrollment_open: true,
      is_enrolled: false,
      is_course_ended: false,
      status: 'published',
    });

    // Deep copy to avoid mutating this.context.
    const enrollableCourseRuns = $.extend(true, [], rawCourseRuns);

    // These are raw course runs from the server. The start
    // dates are ISO-8601 formatted strings that need to be
    // prepped for display.
    _.each(enrollableCourseRuns, (courseRun) => {
      // eslint-disable-next-line no-param-reassign
      courseRun.start_date = CourseCardModel.formatDate(courseRun.start);
      // eslint-disable-next-line no-param-reassign
      courseRun.end_date = CourseCardModel.formatDate(courseRun.end);

      // This is used to render the date when selecting a course run to enroll in
      // eslint-disable-next-line no-param-reassign
      courseRun.dateString = this.formatDateString(courseRun);
    });

    return enrollableCourseRuns;
  }

  getUpcomingCourseRuns() {
    return _.where(this.context.course_runs, {
      is_enrollment_open: false,
      is_enrolled: false,
      is_course_ended: false,
      status: 'published',
    });
  }

  static formatDate(date, userPreferences) {
    let userTimezone = '';
    let userLanguage = '';
    if (userPreferences !== undefined) {
      userTimezone = userPreferences.time_zone;
      userLanguage = userPreferences['pref-lang'];
    }
    const context = {
      datetime: date,
      timezone: userTimezone,
      language: userLanguage,
      format: DateUtils.dateFormatEnum.shortDate,
    };
    return DateUtils.localize(context);
  }

  static getCertificatePriceString(run) {
    if ('seats' in run && run.seats.length) {
      // eslint-disable-next-line consistent-return
      const upgradeableSeats = _.filter(run.seats, (seat) => {
        const upgradeableSeatTypes = ['verified', 'professional', 'no-id-professional', 'credit'];
        if (upgradeableSeatTypes.indexOf(seat.type) >= 0) {
          return seat;
        }
      });
      if (upgradeableSeats.length > 0) {
        const upgradeableSeat = upgradeableSeats[0];
        if (upgradeableSeat) {
          const currency = upgradeableSeat.currency;
          if (currency === 'USD') {
            return `$${upgradeableSeat.price}`;
          }
          return `${upgradeableSeat.price} ${currency}`;
        }
      }
    }
    return null;
  }

  formatDateString(run) {
    const pacingType = run.pacing_type;
    let dateString;
    const start = CourseCardModel.valueIsDefined(run.start_date) ?
      run.advertised_start || run.start_date :
      this.get('start_date');
    const end = CourseCardModel.valueIsDefined(run.end_date) ? run.end_date : this.get('end_date');
    const now = new Date();
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (pacingType === 'self_paced') {
      if (start) {
        dateString = startDate > now ?
          StringUtils.interpolate(gettext('(Self-paced) Starts {start}'), { start }) :
          StringUtils.interpolate(gettext('(Self-paced) Started {start}'), { start });
      } else if (end && endDate > now) {
        dateString = StringUtils.interpolate(gettext('(Self-paced) Ends {end}'), { end });
      } else if (end && endDate < now) {
        dateString = StringUtils.interpolate(gettext('(Self-paced) Ended {end}'), { end });
      }
    } else if (start && end) {
      dateString = `${start} - ${end}`;
    } else if (start) {
      dateString = startDate > now ?
                                StringUtils.interpolate(gettext('Starts {start}'), { start }) :
                                StringUtils.interpolate(gettext('Started {start}'), { start });
    } else if (end) {
      dateString = StringUtils.interpolate(gettext('Ends {end}'), { end });
    }
    return dateString;
  }

  static valueIsDefined(val) {
    return !([undefined, 'None', null].indexOf(val) >= 0);
  }

  setActiveCourseRun(courseRun, userPreferences) {
    let startDateString;
    let courseTitleLink = '';
    const isEnrolled = this.isEnrolledInSession() && courseRun.key;
    if (courseRun) {
      if (CourseCardModel.valueIsDefined(courseRun.advertised_start)) {
        startDateString = courseRun.advertised_start;
      } else {
        startDateString = CourseCardModel.formatDate(courseRun.start, userPreferences);
      }
      if (isEnrolled && courseRun.course_url) {
        courseTitleLink = courseRun.course_url;
      } else if (!isEnrolled && courseRun.marketing_url) {
        courseTitleLink = CourseCardModel.updateMarketingUrl(courseRun);
      }
      this.set({
        certificate_url: courseRun.certificate_url,
        course_run_key: courseRun.key || '',
        course_url: courseRun.course_url || '',
        title: this.context.title,
        end_date: CourseCardModel.formatDate(courseRun.end, userPreferences),
        enrollable_course_runs: this.getEnrollableCourseRuns(),
        is_course_ended: courseRun.is_course_ended,
        is_enrolled: isEnrolled,
        is_enrollment_open: courseRun.is_enrollment_open,
        course_key: this.context.key,
        user_entitlement: this.context.user_entitlement,
        is_unfulfilled_entitlement: this.context.user_entitlement && !isEnrolled,
        marketing_url: courseRun.marketing_url,
        mode_slug: courseRun.type,
        start_date: startDateString,
        upcoming_course_runs: this.getUpcomingCourseRuns(),
        upgrade_url: courseRun.upgrade_url,
        price: CourseCardModel.getCertificatePriceString(courseRun),
        course_title_link: courseTitleLink,
        is_mobile_only: courseRun.is_mobile_only || false,
      });

      // This is used to render the date for completed and in progress courses
      this.set({ dateString: this.formatDateString(courseRun) });
    }
  }

  setUnselected() {
    // Called to reset the model back to the unselected state.
    const unselectedCourseRun = CourseCardModel.getUnselectedCourseRun(this.get('enrollable_course_runs'));
    this.setActiveCourseRun(unselectedCourseRun);
  }

  updateCourseRun(courseRunKey) {
    const selectedCourseRun = _.findWhere(this.get('course_runs'), { key: courseRunKey });
    if (selectedCourseRun) {
      // Update the current context to set the course run to the enrolled state
      _.each(this.context.course_runs, (run) => {
        // eslint-disable-next-line no-param-reassign
        if (run.key === selectedCourseRun.key) run.is_enrolled = true;
      });
      this.setActiveCourseRun(selectedCourseRun);
    }
  }

  // update marketing url for deep linking if is_mobile_only true
  static updateMarketingUrl(courseRun) {
    if (courseRun.is_mobile_only === true) {
      const marketingUrl = courseRun.marketing_url;
      let href = marketingUrl;

      if (marketingUrl.indexOf('course_info?path_id') < 0) {
        const start = marketingUrl.indexOf('course/');
        let path;

        if (start > -1) {
          path = marketingUrl.substr(start);
        }

        href = `edxapp://course_info?path_id=${path}`;
      }

      return href;
    }
    return courseRun.marketing_url;
  }
}

export default CourseCardModel;
